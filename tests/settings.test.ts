// Definições: validação pura + o que a base de dados aceita/recusa (cenário: loja em Angola com Express, transferência e pagar na loja).
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { COUNTRIES } from '../src/lib/countries';
import { buildBusinessPatch, buildOrderSettings, mergeSettings, toOrderSettingsForm, validateHours, type OrderSettingsForm } from '../src/lib/settings';
import { DEFAULT_CONFIG, PAY_METHODS, buildOrderParams, orderConfig, type OrderForm } from '../src/lib/order';
import { SUGGESTED_PAYMENTS, paymentsFor, suggestedPayments } from '../src/lib/payments';
import { dbErrorKey } from '../src/lib/errors';
import { makeDb, asUser } from './helpers/pg';

const kz = { currency: 'AOA', decimals: 2, module: 'catalog' as const };
const base: OrderSettingsForm = { pickup: true, delivery: false, dine_in: false, fee: '', min: '', eta: '1-2 dias', payments: ['express', 'transfer', 'store'], only_when_open: false };

// ---- sugestões e regras de pagamento ----
assert.deepEqual(suggestedPayments('AO'), ['express', 'transfer', 'store']);
assert.deepEqual(suggestedPayments('XX'), ['cash', 'card', 'transfer'], 'país sem sugestão usa a genérica');
for (const [c, list] of Object.entries(SUGGESTED_PAYMENTS)) { assert.ok(COUNTRIES.some((x) => x.code === c), `país ${c} existe`); assert.ok(list.every((p) => (PAY_METHODS as string[]).includes(p)), `métodos válidos em ${c}`); }
assert.deepEqual(paymentsFor({ payments: ['express', 'store'] }, 'pickup'), ['express', 'store']);
assert.deepEqual(paymentsFor({ payments: ['express', 'store'] }, 'delivery'), ['express'], 'pagar na loja não existe em entregas');
assert.deepEqual(paymentsFor({ payments: ['xyz', 'cash'] }, 'pickup'), ['cash'], 'ignora métodos desconhecidos');

// ---- validação do formulário de pedidos ----
let r = buildOrderSettings({ ...base, fee: '300', min: '2 000'.replace(' ', '') }, kz);
assert.ok(r.ok); if (r.ok) { assert.equal(r.value.fee_minor, 30000); assert.equal(r.value.min_minor, 200000); assert.deepEqual(r.value.payments, ['transfer', 'express', 'store'].filter((p) => ['express', 'transfer', 'store'].includes(p)).sort((a, b) => PAY_METHODS.indexOf(a as never) - PAY_METHODS.indexOf(b as never))); assert.equal(r.value.dine_in, false); }
assert.deepEqual(buildOrderSettings({ ...base, pickup: false }, kz), { ok: false, error: 'no_fulfillment' });
assert.deepEqual(buildOrderSettings({ ...base, payments: [] }, kz), { ok: false, error: 'no_payment' });
assert.deepEqual(buildOrderSettings({ ...base, payments: ['store'], delivery: true }, kz), { ok: false, error: 'no_payment_for_delivery' }, 'entrega sem método de pagamento possível');
assert.ok(buildOrderSettings({ ...base, payments: ['store'], delivery: false }, kz).ok, 'só pagar na loja com levantamento é válido');
assert.deepEqual(buildOrderSettings({ ...base, fee: 'abc' }, kz), { ok: false, error: 'fee' });
assert.deepEqual(buildOrderSettings({ ...base, min: '-5' }, kz), { ok: false, error: 'min' });
assert.deepEqual(buildOrderSettings({ ...base, eta: '  ' }, kz), { ok: false, error: 'eta' });
assert.deepEqual(buildOrderSettings({ ...base, eta: 'x'.repeat(61) }, kz), { ok: false, error: 'eta' });
r = buildOrderSettings({ ...base, dine_in: true }, kz); assert.ok(r.ok && r.value.dine_in === false, 'catálogo nunca tem "na mesa"');
r = buildOrderSettings({ ...base, dine_in: true }, { ...kz, module: 'menu' }); assert.ok(r.ok && r.value.dine_in === true);
r = buildOrderSettings({ ...base, payments: ['express', 'express', 'nope', 'transfer'] }, kz); assert.ok(r.ok && r.value.payments.join() === 'transfer,express', 'sem duplicados nem desconhecidos');
assert.deepEqual(toOrderSettingsForm({ ...DEFAULT_CONFIG.catalog, fee_minor: 30000 }, 2).fee, '300.00');
const merged = mergeSettings({ catalog: { low_stock: 5, fee_minor: 1 }, other: 1 }, 'catalog', { pickup: true, delivery: false, dine_in: false, fee_minor: 0, min_minor: 0, eta: 'x', payments: ['cash'], only_when_open: false });
assert.equal((merged.catalog as { low_stock: number }).low_stock, 5, 'não apaga chaves que o ecrã não edita'); assert.equal(merged.other, 1);

// ---- horário e negócio ----
const day = (w: number, o: string, c: string, open = true) => ({ weekday: w, is_open: open, opens: o, closes: c });
assert.ok(validateHours([day(1, '09:00', '18:00'), day(0, '25:00', '01:00', false)]).ok, 'dia fechado não é validado');
assert.deepEqual(validateHours([day(1, '09:00', '18:00'), day(2, '18:00', '09:00')]), { ok: false, weekday: 2 });
assert.deepEqual(validateHours([day(3, '9:00', '18:00')]), { ok: false, weekday: 3 }, 'formato HH:MM');
const biz = { name: ' Perola&charme ', address: '', whatsapp: '923 306 869', country: 'AO', timezone: 'Africa/Luanda', locale: 'pt-PT', is_published: true };
let b = buildBusinessPatch(biz); assert.ok(b.ok && b.patch.whatsapp === '244923306869' && b.patch.address === null && b.patch.name === 'Perola&charme');
assert.deepEqual(buildBusinessPatch({ ...biz, name: 'A' }), { ok: false, error: 'name' });
assert.deepEqual(buildBusinessPatch({ ...biz, whatsapp: '12' }), { ok: false, error: 'whatsapp' });
assert.deepEqual(buildBusinessPatch({ ...biz, country: 'ZZ' }), { ok: false, error: 'country' });
assert.deepEqual(buildBusinessPatch({ ...biz, timezone: 'Marte/Olimpo' }), { ok: false, error: 'timezone' });
assert.deepEqual(buildBusinessPatch({ ...biz, locale: 'fr' }), { ok: false, error: 'locale' });
b = buildBusinessPatch({ ...biz, whatsapp: '' }); assert.ok(b.ok && b.patch.whatsapp === null);
console.log('✔ validação de definições (pedidos, pagamentos, horário, negócio)');

// ---- contra o Postgres real ----
const db = await makeDb();
const owner = randomUUID(), staff = randomUUID();
await db.query('insert into auth.users(id) values ($1),($2)', [owner, staff]);
const tid = (await asUser(db, owner, () => db.query<{ id: string }>(`select create_tenant('perola-charme','Perola&charme','beauty_store','AOA',2,'pt-PT','Europe/Lisbon','PT','244923306869') id`))).rows[0].id;
await db.query(`insert into tenant_members(tenant_id,user_id,role) values ($1,$2,'staff')`, [tid, staff]);
const cat = (await db.query<{ id: string }>(`insert into categories(tenant_id,module,name) values ($1,'catalog','Cabelo') returning id`, [tid])).rows[0].id;
const item = (await db.query<{ id: string }>(`insert into items(tenant_id,module,category_id,name,price_minor,stock) values ($1,'catalog',$2,'Máscara',990000,50) returning id`, [tid, cat])).rows[0].id;

// o dono muda país/fuso e define pagamentos "à Angola": exatamente os campos que o ecrã envia
const bp = buildBusinessPatch({ ...biz, name: 'Perola&charme' }); assert.ok(bp.ok);
const ost = buildOrderSettings({ ...base, delivery: true, fee: '300' }, kz); assert.ok(ost.ok);
if (bp.ok && ost.ok) {
  const settings = mergeSettings((await db.query<{ settings: Record<string, unknown> }>('select settings from tenants where id=$1', [tid])).rows[0].settings, 'catalog', ost.value);
  await asUser(db, owner, () => db.query('update tenants set name=$2, address=$3, whatsapp=$4, country=$5, timezone=$6, locale=$7, is_published=$8, settings=$9 where id=$1',
    [tid, bp.patch.name, bp.patch.address, bp.patch.whatsapp, bp.patch.country, bp.patch.timezone, bp.patch.locale, bp.patch.is_published, JSON.stringify(settings)]));
}
const t = (await db.query<{ country: string; timezone: string; settings: Record<string, unknown> }>('select country,timezone,settings from tenants where id=$1', [tid])).rows[0];
assert.equal(t.country, 'AO'); assert.equal(t.timezone, 'Africa/Luanda');
const cfg = orderConfig(t.settings, 'catalog'); assert.deepEqual(cfg.payments, ['transfer', 'express', 'store'].sort((a, b) => PAY_METHODS.indexOf(a as never) - PAY_METHODS.indexOf(b as never)));
assert.equal(cfg.fee_minor, 30000);
console.log('✔ a base de dados guarda país, fuso e pagamentos enviados pelo ecrã de definições');

let seq = 0; // um telefone diferente por pedido (há um limite de 5 pedidos/hora por telefone)
const place = async (fulfillment: OrderForm['fulfillment'], payment: string) => {
  const built = buildOrderParams({ fulfillment, name: 'Ana Silva', phone: `92330${String(++seq).padStart(4, '0')}`, address: 'Rua A, 1', table: '', payment, change: '', note: '' },
    { slug: 'perola-charme', module: 'catalog', country: 'AO', currency: 'AOA', decimals: 2, lines: [{ itemId: item, qty: 1 }] });
  if (!built.ok) throw new Error(built.error);
  const p = built.params;
  return asUser(db, 'anon', () => db.query<{ r: { total_minor: number } }>('select place_order($1,$2,$3::jsonb,$4,$5,$6,$7,$8,$9,$10,$11) r',
    [p.p_slug, p.p_module, JSON.stringify(p.p_items), p.p_fulfillment, p.p_customer_name, p.p_customer_phone, p.p_address, p.p_table, p.p_payment, p.p_cash_change_minor, p.p_note]));
};
const fails = async (f: OrderForm['fulfillment'], pay: string) => { try { await place(f, pay); return null; } catch (e) { return dbErrorKey(e as { code?: string; message?: string }); } };

assert.ok((await place('pickup', 'express')).rows[0].r, 'Express ao levantar');
assert.ok((await place('pickup', 'transfer')).rows[0].r, 'transferência');
assert.ok((await place('pickup', 'store')).rows[0].r, 'pagar na loja ao levantar (levantamento em loja)');
assert.ok((await place('delivery', 'express')).rows[0].r, 'Express com entrega');
assert.equal((await place('delivery', 'express')).rows[0].r.total_minor, 990000 + 30000, 'entrega soma a taxa de 300,00');
assert.equal(await fails('delivery', 'store'), 'invalid_data', 'pagar na loja com entrega é recusado pela base de dados');
assert.equal(await fails('pickup', 'mbway'), 'payment_not_allowed', 'método não configurado');
assert.equal(await fails('pickup', 'card'), 'payment_not_allowed');
console.log('✔ loja de Angola: Express, transferência e pagar na loja funcionam; combinações inválidas são recusadas');

// horário: upsert como o painel faz; só owner/admin
const rows = [1, 2, 3, 4, 5, 6, 0].map((w) => ({ weekday: w, is_open: w !== 0, opens: '08:30', closes: '17:00' }));
const upsert = (who: string) => asUser(db, who, async () => {
  for (const h of rows) await db.query('insert into business_hours(tenant_id,weekday,is_open,opens,closes) values ($1,$2,$3,$4,$5) on conflict (tenant_id,weekday) do update set is_open=excluded.is_open, opens=excluded.opens, closes=excluded.closes', [tid, h.weekday, h.is_open, h.opens, h.closes]);
}).then(() => null, (e: Error) => e);
assert.equal(await upsert(owner), null);
assert.equal((await db.query<{ n: number }>(`select count(*)::int n from business_hours where tenant_id=$1 and opens='08:30' and closes='17:00'`, [tid])).rows[0].n, 7);
assert.ok(await upsert(staff), 'staff não altera o horário');
const staffUpdate = await asUser(db, staff, () => db.query(`update tenants set name='X' where id=$1`, [tid]).then((r) => r.affectedRows ?? 0));
assert.equal(staffUpdate, 0, 'staff não altera o negócio (nenhuma linha afetada)');
// esconder a loja ao público
await asUser(db, owner, () => db.query('update tenants set is_published=false where id=$1', [tid]));
assert.equal(await fails('pickup', 'express'), 'tenant_not_found', 'loja despublicada não recebe pedidos');
assert.equal((await asUser(db, 'anon', () => db.query('select id from tenants where id=$1', [tid]))).rows.length, 0, 'público deixa de ver a loja');
console.log('✔ horário (owner sim, staff não) e loja despublicada');

// ---- só aceitar pedidos com a loja aberta ----
await asUser(db, owner, () => db.query('update tenants set is_published=true where id=$1', [tid]));
const onlyOpen = buildOrderSettings({ ...base, delivery: true, fee: '300', only_when_open: true }, kz); assert.ok(onlyOpen.ok && onlyOpen.value.only_when_open === true);
assert.ok(buildOrderSettings({ ...base }, kz).ok && (buildOrderSettings({ ...base }, kz) as { value: { only_when_open: boolean } }).value.only_when_open === false, 'por defeito aceita pedidos fechada');
if (onlyOpen.ok) {
  const st = mergeSettings((await db.query<{ settings: Record<string, unknown> }>('select settings from tenants where id=$1', [tid])).rows[0].settings, 'catalog', onlyOpen.value);
  await asUser(db, owner, () => db.query('update tenants set settings=$2 where id=$1', [tid, JSON.stringify(st)]));
}
// tenant_is_open no fuso do negócio (Luanda = UTC+1): segunda-feira 2026-09-21
await db.query(`update business_hours set is_open = (weekday <> 0), opens='10:00', closes='19:00' where tenant_id=$1`, [tid]);
const isOpen = async (iso: string) => (await db.query<{ o: boolean }>(`select tenant_is_open($1, $2::timestamptz) o`, [tid, iso])).rows[0].o;
assert.equal(await isOpen('2026-09-21T10:00:00+01:00'), true, 'segunda 10:00 em Luanda: aberto');
assert.equal(await isOpen('2026-09-21T09:59:00+01:00'), false, 'segunda 09:59: ainda fechado');
assert.equal(await isOpen('2026-09-21T18:59:00+01:00'), true); assert.equal(await isOpen('2026-09-21T19:00:00+01:00'), false, 'fecha às 19:00');
assert.equal(await isOpen('2026-09-27T12:00:00+01:00'), false, 'domingo fechado');
assert.equal(await isOpen('2026-09-21T09:30:00Z'), true, 'o mesmo instante em UTC (10:30 em Luanda)');
// place_order respeita a opção
await db.query(`update business_hours set is_open=false where tenant_id=$1`, [tid]);
assert.equal(await fails('pickup', 'express'), 'store_closed', 'loja fechada com a opção ligada recusa o pedido');
await db.query(`update business_hours set is_open=true, opens='00:00', closes='23:59' where tenant_id=$1`, [tid]);
assert.ok((await place('pickup', 'express')).rows[0].r, 'loja aberta aceita');
const off = mergeSettings((await db.query<{ settings: Record<string, unknown> }>('select settings from tenants where id=$1', [tid])).rows[0].settings, 'catalog', { ...(onlyOpen.ok ? onlyOpen.value : (undefined as never)), only_when_open: false });
await db.query('update tenants set settings=$2 where id=$1', [tid, JSON.stringify(off)]);
await db.query(`update business_hours set is_open=false where tenant_id=$1`, [tid]);
assert.ok((await place('pickup', 'express')).rows[0].r, 'com a opção desligada, aceita pedidos mesmo fechada');
console.log('✔ só aceitar pedidos com a loja aberta (fuso do negócio, opção ligada/desligada)');
process.exit(0);
