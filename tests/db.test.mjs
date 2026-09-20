// Testa migrações + RLS + RPCs num Postgres real (PGlite, em memória). Uso: npm run test:db
process.on('uncaughtException', e => { console.error('\n✘ ERRO NO TESTE:', String(e.message).slice(0,300)); process.exit(1); });
import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { readFileSync, readdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const db = new PGlite({ extensions: { btree_gist } });
let fails = 0;
const ok = (c, m) => { console.log((c ? '✔ ' : '✘ ') + m); if (!c) fails++; };

// --- simulação mínima do Supabase (auth + papéis) ---
await db.exec(`
  create schema auth;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create role anon nologin; create role authenticated nologin;
  grant usage on schema public, auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant execute on functions to anon, authenticated;
`);
const dir = new URL('../supabase/migrations/', import.meta.url);
for (const f of readdirSync(dir).sort()) await db.exec(readFileSync(new URL(f, dir), 'utf8'));
ok(true, 'migrações aplicadas sem erros');

const A = randomUUID(), B = randomUUID();
await db.query('insert into auth.users(id) values ($1),($2)', [A, B]);

// executa como anon / utilizador autenticado
async function as(who, fn) {
  await db.exec(who === 'anon' ? `set role anon; select set_config('request.jwt.claim.sub','',false)`
                               : `set role authenticated; select set_config('request.jwt.claim.sub','${who}',false)`);
  try { return await fn(); } finally { await db.exec('reset role'); }
}
const q = (sql, p) => db.query(sql, p).then(r => r.rows);
const hidden = async (who, table) => { try { const r = await as(who, () => q(`select count(*)::int n from ${table}`)); return r[0].n === 0; } catch { return true; } };
const fail = async (fn) => { try { await fn(); return null; } catch (e) { return String(e.message || e); } };

// ---------- onboarding por nicho + moeda ----------
const cafe = (await as(A, () => q(`select create_tenant('cafe-aurora','Café Aurora','restaurant','EUR',2,'pt-PT','Europe/Lisbon','PT','351912345678') id`)))[0].id;
let t = (await q('select * from tenants where id=$1', [cafe]))[0];
ok(t.modules.menu && t.modules.loyalty && !t.modules.agenda && !t.modules.catalog, 'nicho restaurante liga cardápio + fidelidade');
ok(t.currency === 'EUR' && t.locale === 'pt-PT', 'moeda e idioma por negócio');
const prog = (await q('select * from loyalty_programs where tenant_id=$1', [cafe]))[0];
ok(prog.goal === 10 && prog.reward === '1 refeição grátis', 'programa de fidelidade inicial traduzido');
ok((await q('select count(*)::int n from business_hours where tenant_id=$1', [cafe]))[0].n === 7, '7 dias de horário criados');

const salao = (await as(B, () => q(`select create_tenant('salao-bela','Salão Bela','salon','BRL',2,'pt-BR','America/Sao_Paulo','BR','5511999990000') id`)))[0].id;
ok((await q('select count(*)::int n from staff where tenant_id=$1', [salao]))[0].n === 1, 'nicho cabeleireiro cria agenda com 1 profissional');
const yen = (await as(A, () => q(`select create_tenant('loja-tokyo','Tokyo Beauty','beauty_store','JPY',0,'ja-JP','Asia/Tokyo','JP','81312345678') id`)))[0].id;
ok((await q('select currency, currency_decimals from tenants where id=$1', [yen]))[0].currency_decimals === 0, 'moeda sem casas decimais (JPY)');

ok(await as('anon', () => fail(() => q(`select create_tenant('x-y','Xy')`))) !== null, 'anónimo não cria negócio');
ok(await as(A, () => fail(() => q(`select create_tenant('admin','Nome')`))) !== null, 'slug reservado recusado');
ok(await as(A, () => fail(() => q(`select create_tenant('ok-slug','Nome','general','EUR',2,'pt-PT','Nao/Existe')`))) !== null, 'fuso horário inválido recusado');

// ---------- catálogo ----------
const cat = (await as(A, () => q(`insert into categories(tenant_id,module,name) values ($1,'menu','Cafés') returning id`, [cafe])))[0].id;
const cap = (await as(A, () => q(`insert into items(tenant_id,module,category_id,name,price_minor,stock) values ($1,'menu',$2,'Cappuccino',280,5) returning id`, [cafe, cat])))[0].id;
const bolo = (await as(A, () => q(`insert into items(tenant_id,module,category_id,name,price_minor,promo_minor) values ($1,'menu',$2,'Bolo',400,300) returning id`, [cafe, cat])))[0].id;
ok(await as(B, () => fail(() => q(`insert into items(tenant_id,module,name,price_minor) values ($1,'menu','Intruso',1)`, [cafe]))) !== null, 'outro negócio NÃO escreve no meu catálogo');
ok((await as('anon', () => q('select id from items where tenant_id=$1', [cafe]))).length === 2, 'público lê o catálogo publicado');
ok(await as(A, () => fail(() => q(`insert into items(tenant_id,module,category_id,name,price_minor) values ($1,'menu',$2,'X',1)`, [salao, cat]))) !== null, 'não referencia categoria de outro negócio');
ok(await as(A, () => fail(() => q(`insert into items(tenant_id,module,name,price_minor,promo_minor) values ($1,'menu','Y',100,150)`, [cafe]))) !== null, 'promoção maior que preço recusada');

// ---------- pedidos (público → servidor calcula preços) ----------
const order = (await as('anon', () => q(
  `select place_order('cafe-aurora','menu',$1::jsonb,'delivery','Ana Silva','351911111111','Rua A, 1',null,'cash',2000,'sem açúcar') r`,
  [JSON.stringify([{ item_id: cap, qty: 2 }, { item_id: bolo, qty: 1, note: 'com vela' }])])))[0].r;
ok(order.number === 1001, 'primeiro pedido é o nº 1001');
ok(order.total_minor === 280 * 2 + 300 + 0 && order.currency === 'EUR', `total calculado no servidor (${order.total_minor}) com preço promocional`);
ok((await q('select stock from items where id=$1', [cap]))[0].stock === 3, 'stock baixou de 5 para 3');
ok(await hidden('anon', 'orders'), 'público NÃO lê pedidos');
ok(await as('anon', () => fail(() => q(`insert into orders(tenant_id,number,module,fulfillment,customer_name,customer_phone,currency) values ($1,9,'menu','pickup','Hack','351911111111','EUR')`, [cafe]))) !== null, 'público NÃO insere pedidos diretamente');
ok((await as('anon', () => q('select get_order_status($1) s', [order.public_token])))[0].s.status === 'new', 'cliente acompanha pedido com o token');
ok((await as(B, () => q('select count(*)::int n from orders'))).at(0).n === 0, 'outro negócio NÃO vê os meus pedidos');
ok((await as(A, () => q('select count(*)::int n from orders'))).at(0).n === 1, 'dono vê o pedido');
const bad = (msg, sql, p) => as('anon', () => fail(() => q(sql, p))).then(e => ok(e && e.includes(msg), `erro "${msg}" validado`));
await bad('insufficient_stock', `select place_order('cafe-aurora','menu',$1::jsonb,'pickup','Ana Silva','351911111111')`, [JSON.stringify([{ item_id: cap, qty: 9 }])]);
await bad('module_disabled', `select place_order('cafe-aurora','catalog',$1::jsonb,'pickup','Ana Silva','351911111111')`, [JSON.stringify([{ item_id: cap, qty: 1 }])]);
await as(A, () => q(`update tenants set settings = jsonb_set(settings,'{menu,min_minor}','10000') where id=$1`, [cafe]));
await bad('below_minimum', `select place_order('cafe-aurora','menu',$1::jsonb,'pickup','Ana Silva','351911111111')`, [JSON.stringify([{ item_id: cap, qty: 1 }])]);
await as(A, () => q(`update tenants set settings = jsonb_set(settings,'{menu,min_minor}','0') where id=$1`, [cafe]));
await as(A, () => q(`update tenants set settings = jsonb_set(settings,'{menu,dine_in}','false') where id=$1`, [cafe]));
await bad('fulfillment_not_allowed', `select place_order('cafe-aurora','menu',$1::jsonb,'dine_in','Ana Silva','351911111111',null,'4')`, [JSON.stringify([{ item_id: cap, qty: 1 }])]);
await as(A, () => q(`update tenants set settings = jsonb_set(settings,'{menu,dine_in}','true') where id=$1`, [cafe]));
await bad('invalid_phone', `select place_order('cafe-aurora','menu',$1::jsonb,'pickup','Ana Silva','abc')`, [JSON.stringify([{ item_id: cap, qty: 1 }])]);
await bad('address_required', `select place_order('cafe-aurora','menu',$1::jsonb,'delivery','Ana Silva','351911111111','x')`, [JSON.stringify([{ item_id: cap, qty: 1 }])]);
await bad('payment_not_allowed', `select place_order('cafe-aurora','menu',$1::jsonb,'pickup','Ana Silva','351911111111',null,null,'pix')`, [JSON.stringify([{ item_id: cap, qty: 1 }])]);
ok((await q('select stock from items where id=$1', [cap]))[0].stock === 3, 'pedido recusado não mexe no stock (transação atómica)');

// ---------- estados, stock e fidelidade automática ----------
const oid = order.order_id;
await as(A, () => q(`update orders set status='preparing' where id=$1`, [oid]));
await as(A, () => q(`update orders set status='cancelled' where id=$1`, [oid]));
ok((await q('select stock from items where id=$1', [cap]))[0].stock === 5, 'cancelar devolve o stock');
ok(await as(A, () => fail(() => q(`update orders set status='new' where id=$1`, [oid]))) !== null, 'pedido cancelado não reabre');
ok(await as(A, () => fail(() => q(`update orders set total_minor=1 where id=$1`, [oid]))) !== null, 'membro NÃO altera o total do pedido');
const o2 = (await as('anon', () => q(`select place_order('cafe-aurora','menu',$1::jsonb,'pickup','Rui Costa','351922222222') r`, [JSON.stringify([{ item_id: bolo, qty: 1 }])])))[0].r;
await as(A, () => q(`update orders set status='completed' where id=$1`, [o2.order_id]));
const lc = (await q(`select * from loyalty_customers where tenant_id=$1 and phone='351922222222'`, [cafe]))[0];
ok(lc && lc.balance === 1 && lc.total_minor === 300, 'concluir pedido carimba a fidelidade sozinho');
await as(A, () => q(`update orders set status='completed' where id=$1`, [o2.order_id])).catch(() => {});
ok((await q('select balance from loyalty_customers where id=$1', [lc.id]))[0].balance === 1, 'não pontua duas vezes');

// ---------- fidelidade manual ----------
for (let i = 0; i < 9; i++) await as(A, () => q(`select loyalty_earn($1,'351922222222','Rui Costa',0)`, [cafe]));
ok((await q('select balance from loyalty_customers where id=$1', [lc.id]))[0].balance === 10, 'carimbos acumulam até à meta');
ok(await as(B, () => fail(() => q(`select loyalty_earn($1,'351933333333','X',0)`, [cafe]))) !== null, 'outro negócio NÃO pontua no meu programa');
ok((await as(A, () => q(`select loyalty_redeem($1) r`, [lc.id])))[0].r.balance === 0, 'resgate desconta a meta do saldo');
ok(await as(A, () => fail(() => q(`select loyalty_redeem($1)`, [lc.id]))) !== null, 'sem saldo não resgata');
const card = (await as('anon', () => q(`select loyalty_card('cafe-aurora','351922222222') c`)))[0].c;
ok(card.found && card.first_name === 'Rui' && card.goal === 10, 'cliente consulta o cartão pelo telefone');
ok(await hidden('anon', 'loyalty_customers'), 'público NÃO lista clientes de fidelidade');

// pontos com moeda sem casas decimais (JPY): 1 ponto por ¥1
await as(A, () => q(`update loyalty_programs set mode='points', goal=100, points_per_unit=1 where tenant_id=$1`, [yen]));
ok((await as(A, () => q(`select loyalty_earn($1,'819012345678','Aiko',1500) r`, [yen])))[0].r.delta === 1500, 'JPY: ¥1500 = 1500 pontos');
await as(A, () => q(`update loyalty_programs set points_per_unit=1 where tenant_id=$1`, [cafe]));
await as(A, () => q(`update loyalty_programs set mode='points', goal=100, points_per_unit=2 where tenant_id=$1`, [cafe]));
ok((await as(A, () => q(`select loyalty_earn($1,'351944444444','Zé',1250) r`, [cafe])))[0].r.delta === 25, 'EUR: €12,50 × 2 = 25 pontos');

// ---------- agenda ----------
const svc = (await as(B, () => q(`insert into services(tenant_id,name,duration_min,price_minor) values ($1,'Corte',60,2500) returning id`, [salao])))[0].id;
await as(B, () => q(`update staff set name='Marta' where tenant_id=$1`, [salao]));   // renomeia o profissional criado no onboarding
await q(`update business_hours set is_open=true, opens='09:00', closes='18:00' where tenant_id=$1`, [salao]);
let day = new Date(); day.setDate(day.getDate() + 2); const d = day.toISOString().slice(0, 10);
const slots = await as('anon', () => q(`select out_time::text tm, out_staff from available_slots('salao-bela',$1,null,$2::date)`, [svc, d]));
ok(slots.length >= 8, `horários livres calculados no servidor (${slots.length})`);
const first = slots[0].tm.slice(0, 5);
const bk = (await as('anon', () => q(`select create_booking('salao-bela',$1,null,$2::date,$3::time,'Carla Dias','5511988887777') r`, [svc, d, first])))[0].r;
ok(bk.status === 'confirmed', 'reserva confirmada automaticamente');
const after = await as('anon', () => q(`select out_time::text tm, out_staff from available_slots('salao-bela',$1,null,$2::date)`, [svc, d]));
ok(!after.some(s => s.tm.slice(0, 5) === first), 'horário reservado desaparece dos livres');
ok(await as('anon', () => fail(() => q(`select create_booking('salao-bela',$1,null,$2::date,$3::time,'Outra Pessoa','5511977776666')`, [svc, d, first]))) !== null, 'segunda reserva no mesmo horário é recusada');
const sobre = await as('anon', () => q(`select out_time::text tm from available_slots('salao-bela',$1,null,$2::date)`, [svc, d]));
const [hh, mm] = first.split(':').map(Number); const half = `${String(hh).padStart(2, '0')}:${String(mm + 30).padStart(2, '0')}`;
ok(!sobre.some(s => s.tm.slice(0, 5) === half), 'serviço de 60 min também bloqueia o meio horário seguinte (sobreposição)');
ok(await hidden('anon', 'bookings'), 'público NÃO lê reservas');
ok((await as('anon', () => q(`select cancel_booking($1) r`, [bk.public_token])))[0].r.ok, 'cliente cancela com o token');
const again = await as('anon', () => q(`select out_time::text tm from available_slots('salao-bela',$1,null,$2::date)`, [svc, d]));
ok(again.some(s => s.tm.slice(0, 5) === first), 'horário cancelado volta a ficar livre');
// dois profissionais → "qualquer" distribui
await as(B, () => q(`insert into staff(tenant_id,name) values ($1,'Nuno')`, [salao]));
const r1 = (await as('anon', () => q(`select create_booking('salao-bela',$1,null,$2::date,$3::time,'Cliente Um','5511900000001') r`, [svc, d, first])))[0].r;
const r2 = (await as('anon', () => q(`select create_booking('salao-bela',$1,null,$2::date,$3::time,'Cliente Dois','5511900000002') r`, [svc, d, first])))[0].r;
ok(r1.staff_name !== r2.staff_name, `"qualquer profissional" distribui (${r1.staff_name} / ${r2.staff_name})`);
ok(await as('anon', () => fail(() => q(`select create_booking('salao-bela',$1,null,$2::date,$3::time,'Cliente Tres','5511900000003')`, [svc, d, first]))) !== null, 'sem profissional livre a reserva é recusada');
// bloqueio de dia e fim de reserva
await as(B, () => q(`insert into blocked_dates(tenant_id,day) values ($1,$2)`, [salao, d]));
ok((await as('anon', () => q(`select count(*)::int n from available_slots('salao-bela',$1,null,$2::date)`, [svc, d])))[0].n === 0, 'dia bloqueado não tem horários');
// concluir atendimento pontua fidelidade
const bid = (await q(`select id from bookings where customer_phone='5511900000001'`))[0].id;
await as(B, () => q(`update bookings set status='completed' where id=$1`, [bid]));
ok((await q(`select balance from loyalty_customers where tenant_id=$1 and phone='5511900000001'`, [salao]))[0].balance === 1, 'concluir atendimento carimba a fidelidade');

// ---------- equipa e papéis ----------
await as(A, () => q(`insert into tenant_members(tenant_id,user_id,role) values ($1,$2,'staff')`, [cafe, B]));
ok((await as(B, () => q('select count(*)::int n from orders where tenant_id=$1', [cafe])))[0].n === 2, 'membro staff vê pedidos do negócio');
ok(await as(B, () => fail(() => q(`insert into items(tenant_id,module,name,price_minor) values ($1,'menu','Z',1)`, [cafe]))) !== null, 'staff NÃO edita o catálogo (só owner/admin)');
ok(await as(B, () => fail(() => q(`update tenants set name='Roubado' where id=$1`, [cafe]))) !== null || (await q('select name from tenants where id=$1', [cafe]))[0].name === 'Café Aurora', 'staff NÃO altera o negócio');
ok(await hidden('anon', 'tenant_members'), 'público NÃO lista membros');
ok(await hidden('anon', 'order_items'), 'público NÃO lê linhas de pedido');
ok(await as('anon', () => fail(() => q('select * from tenant_counters'))) !== null, 'contadores internos inacessíveis');

console.log(fails ? `\n${fails} FALHA(S)` : '\nTODOS OS TESTES PASSARAM');
process.exit(fails ? 1 : 0);
