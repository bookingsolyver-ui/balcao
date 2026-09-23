// Mudanças: validação, sugestão de preço, CSV e o fluxo completo contra o Postgres real (pedido → orçamento → confirmado → concluído).
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { DEFAULT_MOVING, addressLine, buildMoveRequest, buildMovingSettings, emptyMoveForm, estimateVolume, isLiveMove, mergeMoving, moveActions, moveGuard, moveMessage, movesToCsv, movingConfig, normalizePostalPT, parseVolume, suggestQuote, toMovingSettingsForm, type MoveForm, type MoveRow, type MoveTrack } from '../src/lib/moving';
import { dbErrorKey } from '../src/lib/errors';
import { makeDb, asUser } from './helpers/pg';

const today = new Date().toISOString().slice(0, 10);
const plus = (n: number) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const form = (over: Partial<MoveForm> = {}): MoveForm => ({ ...emptyMoveForm(), volume: '45,5', name: ' Maria Santos ', phone: '912 345 678', email: 'maria@exemplo.pt', consent: true,
  origin: { street: 'Rua das Flores 10', city: 'Lisboa', postal: '1200123', floor: '3', elevator: 'no', access: 'Rua estreita' },
  destination: { street: 'Avenida dos Aliados 5', city: 'Porto', postal: '4000-064', floor: '1', elevator: 'yes', access: '' },
  extras: ['Embalagem'], special: ['Piano'], preferredDate: plus(20), window: 'morning', notes: 'Piano de cauda no 3º andar, sem elevador', ...over });
const ctx = { country: 'PT', today, fullDays: [] as string[] };

// ---- validação ----
assert.equal(parseVolume('45,5'), 45.5); assert.equal(parseVolume('45.55'), 45.6); assert.equal(parseVolume('0'), null); assert.equal(parseVolume('abc'), null); assert.equal(parseVolume('1000'), null); assert.equal(parseVolume('-3'), null);
assert.equal(normalizePostalPT('1200123'), '1200-123'); assert.equal(normalizePostalPT('1200-123'), '1200-123'); assert.equal(normalizePostalPT('12'), null); assert.equal(normalizePostalPT('1200 123'), '1200-123');
let r = buildMoveRequest(form(), ctx);
assert.ok(r.ok); if (r.ok) { const p = r.payload; assert.equal(p.name, 'Maria Santos'); assert.equal(p.phone, '351912345678'); assert.equal(p.volume_m3, 45.5); assert.equal(p.origin.postal, '1200-123'); assert.equal(p.origin.floor, 3); assert.equal(p.origin.elevator, false); assert.equal(p.destination.elevator, true); assert.equal(p.destination.access, null); assert.equal(p.consent, true); assert.deepEqual(p.extras, ['Embalagem']); }
const bad = (patch: Partial<MoveForm>, err: string, c = ctx) => assert.deepEqual(buildMoveRequest(form(patch), c), { ok: false, error: err } as never, err);
bad({ name: 'A' }, 'name'); bad({ phone: '12' }, 'phone'); bad({ email: 'x@' }, 'email'); bad({ volume: '' }, 'volume'); bad({ consent: false }, 'consent'); bad({ notes: 'x'.repeat(2001) }, 'notes');
bad({ origin: { ...form().origin, street: 'ab' } }, 'origin'); bad({ destination: { ...form().destination, city: '' } }, 'destination');
bad({ origin: { ...form().origin, postal: '12' } }, 'origin_postal'); bad({ destination: { ...form().destination, floor: '99' } }, 'destination_floor'); bad({ origin: { ...form().origin, floor: 'x' } }, 'origin_floor');
bad({ preferredDate: '2020-01-01' }, 'date'); bad({ preferredDate: 'amanhã' }, 'date');
bad({ preferredDate: plus(20) }, 'day_full', { ...ctx, fullDays: [plus(20)] });
assert.ok(buildMoveRequest(form({ preferredDate: plus(20), flexible: true }), { ...ctx, fullDays: [plus(20)] }).ok, 'data flexível permite um dia cheio');
assert.ok(buildMoveRequest(form({ preferredDate: '', email: '', origin: { ...form().origin, postal: '', floor: '', elevator: '' } }), ctx).ok, 'data, email, código postal e andar são opcionais');
assert.ok(buildMoveRequest(form({ origin: { ...form().origin, postal: 'ABC 123' } }), { ...ctx, country: 'BR' }).ok, 'fora de Portugal o código postal não é validado');
assert.equal(estimateVolume('T2', DEFAULT_MOVING), 28); assert.equal(estimateVolume('T9', DEFAULT_MOVING), null);
assert.deepEqual(moveActions('new'), ['visit', 'quoted', 'lost']); assert.deepEqual(moveActions('done'), []); assert.deepEqual(moveActions('lost'), ['new']); assert.equal(isLiveMove('confirmed'), true); assert.equal(isLiveMove('lost'), false);
assert.equal(moveGuard('quoted', { quoted: '', confirmedDate: '' }), 'quote_required'); assert.equal(moveGuard('confirmed', { quoted: '900', confirmedDate: '' }), 'date_required'); assert.equal(moveGuard('confirmed', { quoted: '900', confirmedDate: '2026-10-01' }), null); assert.equal(moveGuard('visit', { quoted: '', confirmedDate: '' }), null);
console.log('✔ validação do pedido de mudança (m³, moradas, código postal PT, data, consentimento)');

// ---- sugestão de preço, definições, mensagem e CSV ----
const cfg = { ...DEFAULT_MOVING, rate_per_m3_minor: 3500, min_price_minor: 30000, per_floor_minor: 1500, extras: [{ name: 'Embalagem', price_minor: 12000 }] };
const req = { volume_m3: 45.5, origin_floor: 3, origin_elevator: false, dest_floor: 1, dest_elevator: true, extras: ['Embalagem'] };
assert.equal(suggestQuote(req, cfg), Math.round(45.5 * 3500) + 3 * 1500 + 12000, '45,5 m³ × 35 € + 3 andares sem elevador + embalagem');
assert.equal(suggestQuote({ ...req, volume_m3: 2, extras: [], origin_floor: 0 }, cfg), 30000, 'preço mínimo');
assert.equal(suggestQuote(req, DEFAULT_MOVING), null, 'sem tarifa não há sugestão');
assert.equal(movingConfig({}).max_jobs_per_day, 2); assert.equal(movingConfig({ moving: { max_jobs_per_day: 4, extras: 'x' } }).max_jobs_per_day, 4); assert.deepEqual(movingConfig({ moving: { extras: 'x' } }).extras, DEFAULT_MOVING.extras);
const sf = toMovingSettingsForm(cfg, 2); assert.equal(sf.rate, '35.00');
let ms = buildMovingSettings({ ...sf, capacity: '3', special: 'Piano, Cofre, Piano', crews: 'Equipa A, Equipa B', privacy: 'https://exemplo.pt/privacidade' }, { currency: 'EUR', decimals: 2 });
assert.ok(ms.ok && ms.value.max_jobs_per_day === 3 && ms.value.rate_per_m3_minor === 3500 && ms.value.special_items.join() === 'Piano,Cofre' && ms.value.crews.length === 2);
assert.deepEqual(buildMovingSettings({ ...sf, rate: 'x' }, { currency: 'EUR', decimals: 2 }), { ok: false, error: 'rate' }); assert.deepEqual(buildMovingSettings({ ...sf, capacity: '0' }, { currency: 'EUR', decimals: 2 }), { ok: false, error: 'capacity' });
assert.deepEqual(buildMovingSettings({ ...sf, typologies: [{ key: 'T1', m3: '0' }] }, { currency: 'EUR', decimals: 2 }), { ok: false, error: 'typology' }); assert.deepEqual(buildMovingSettings({ ...sf, privacy: 'javascript:alert(1)' }, { currency: 'EUR', decimals: 2 }), { ok: false, error: 'privacy' });
assert.equal((mergeMoving({ menu: { a: 1 } }, cfg).menu as { a: number }).a, 1);
const labels = { title: 'Pedido de orçamento', customer: 'Cliente', type: 'Tipo', volume: 'Volume', from: 'Origem', to: 'Destino', extras: 'Serviços extra', special: 'Itens especiais', date: 'Data preferida', notes: 'Observações', track: 'Acompanhar' };
const msg = moveMessage({ number: 1001, business: 'Mudanças Rápidas', name: 'Maria Santos', phone: '351912345678', email: 'maria@exemplo.pt', typeLabel: 'Casa', volume: '45,5 m³', origin: addressLine('Rua das Flores 10', 'Lisboa', '1200-123', 3, false, { floor: 'andar', elevatorYes: 'com elevador', elevatorNo: 'sem elevador' }), destination: 'Avenida dos Aliados 5, 4000-064 Porto', extras: ['Embalagem'], special: ['Piano'], date: '2026-10-10 (manhã)', notes: 'Piano de cauda', trackUrl: 'https://x/m/1', labels });
assert.match(msg, /^\*Pedido de orçamento #1001\* — Mudanças Rápidas/); assert.match(msg, /Origem: Rua das Flores 10, 1200-123 Lisboa, 3º andar, sem elevador/); assert.match(msg, /Itens especiais: Piano/); assert.match(msg, /Observações: Piano de cauda/); assert.match(msg, /Acompanhar: https:\/\/x\/m\/1$/);
console.log('✔ sugestão de preço, definições, mensagem de WhatsApp');

// ---- contra o Postgres real ----
const db = await makeDb();
const owner = randomUUID(), staff = randomUUID(), stranger = randomUUID();
await db.query('insert into auth.users(id) values ($1),($2),($3)', [owner, staff, stranger]);
const create = async (slug: string, niche = 'moving') => (await asUser(db, owner, () => db.query<{ id: string }>(`select create_tenant($1,$2,$3,'EUR',2,'pt-PT','Europe/Lisbon','PT','351911111111') id`, [slug, 'Mudanças ' + slug, niche]))).rows[0].id;
const tid = await create('mudancas-rapidas');
await db.query(`insert into tenant_members(tenant_id,user_id,role) values ($1,$2,'staff')`, [tid, staff]);
const t0 = (await db.query<{ modules: Record<string, boolean>; settings: { moving: { max_jobs_per_day: number } } }>('select modules, settings from tenants where id=$1', [tid])).rows[0];
assert.deepEqual(Object.keys(t0.modules).filter((k) => t0.modules[k]), ['moving'], 'nicho mudanças liga só o módulo de mudanças'); assert.equal(t0.settings.moving.max_jobs_per_day, 2);

const submit = async (f: MoveForm, slug = 'mudancas-rapidas', c = ctx) => {
  const b = buildMoveRequest(f, c); if (!b.ok) throw new Error('form ' + b.error);
  return (await asUser(db, 'anon', () => db.query<{ r: { number: number; public_token: string; status: string } }>('select submit_move_request($1,$2::jsonb) r', [slug, JSON.stringify(b.payload)]))).rows[0].r;
};
const sub = async (payload: unknown, slug = 'mudancas-rapidas') => asUser(db, 'anon', () => db.query('select submit_move_request($1,$2::jsonb)', [slug, JSON.stringify(payload)])).then(() => null, (e) => dbErrorKey(e as never));
const err = async (fn: () => Promise<unknown>) => fn().then(() => null, (e) => dbErrorKey(e as never));

const a = await submit(form()); const b = await submit(form({ phone: '913000001', name: 'João Pires' }));
assert.equal(a.number, 1001); assert.equal(b.number, 1002); assert.equal(a.status, 'new');
const row = (await db.query<MoveRow>('select *, volume_m3::float8 as volume_m3 from move_requests where number=1001 and tenant_id=$1', [tid])).rows[0];
assert.equal(row.volume_m3, 45.5); assert.equal(row.origin_postal, '1200-123'); assert.equal(row.origin_elevator, false); assert.deepEqual(row.extras, ['Embalagem']); assert.deepEqual(row.special_items, ['Piano']); assert.equal(row.currency, 'EUR'); assert.equal(row.notes, 'Piano de cauda no 3º andar, sem elevador');
console.log('✔ pedido gravado com todos os dados (m³, moradas, extras, observações, consentimento) e numeração por negócio');

// o servidor valida tudo, mesmo sem o formulário
const base = buildMoveRequest(form({ phone: '914000002' }), ctx);
if (!base.ok) throw new Error('base form invalid');
const P = base.payload;
assert.equal(await sub({ ...P, consent: false }), 'consent_required'); assert.equal(await sub({ ...P, name: 'A' }), 'invalid_name'); assert.equal(await sub({ ...P, phone: '12' }), 'invalid_phone');
assert.equal(await sub({ ...P, email: 'x' }), 'invalid_email'); assert.equal(await sub({ ...P, volume_m3: 0 }), 'invalid_volume'); assert.equal(await sub({ ...P, volume_m3: 'abc' }), 'invalid_volume'); assert.equal(await sub({ ...P, volume_m3: 1000 }), 'invalid_volume');
assert.equal(await sub({ ...P, origin: { ...P.origin, street: 'ab' } }), 'invalid_address'); assert.equal(await sub({ ...P, destination: null }), 'invalid_address');
assert.equal(await sub({ ...P, origin: { ...P.origin, floor: 99 } }), 'invalid_floor'); assert.equal(await sub({ ...P, preferred_date: '2020-01-01' }), 'invalid_date'); assert.equal(await sub({ ...P, preferred_date: plus(900) }), 'invalid_date'); assert.equal(await sub({ ...P, preferred_date: 'xx' }), 'invalid_date');
assert.equal(await sub({ ...P, extras: Array.from({ length: 21 }, (_, i) => 'x' + i) }), 'invalid_extras'); assert.equal(await sub({ ...P, time_window: 'noite' }), 'invalid_data'); assert.equal(await sub({ ...P, move_type: 'x' }), 'invalid_data'); assert.equal(await sub('nada'), 'invalid_data');
assert.equal(await sub(P, 'nao-existe'), 'tenant_not_found');
const shop = await create('loja-beleza', 'beauty_store'); assert.equal(await sub(P, 'loja-beleza'), 'module_disabled', 'só negócios com o módulo de mudanças recebem pedidos'); void shop;
for (let i = 0; i < 3; i++) await submit(form({ phone: '915000003', name: 'Rui ' + i }));
assert.equal(await err(() => submit(form({ phone: '915000003' }))), 'too_many_requests', 'máximo 3 pedidos por hora por telefone');
console.log('✔ o servidor recusa dados inválidos, negócio sem o módulo e abusos');

// privacidade: o público não lê pedidos; equipa lê; outros negócios não
const count = async (who: string) => asUser(db, who, async () => { try { return (await db.query<{ n: number }>('select count(*)::int n from move_requests')).rows[0].n; } catch { return 0; } });
assert.equal(await count('anon'), 0); assert.equal(await count(stranger), 0); assert.ok((await count(staff)) >= 2); assert.ok((await count(owner)) >= 2);
const own = (await db.query<{ id: string }>('select id from move_requests where number=1001 and tenant_id=$1', [tid])).rows[0].id;
assert.equal(await err(() => asUser(db, staff, () => db.query(`update move_requests set customer_name='X' where id=$1`, [own]))), 'forbidden', 'a equipa não altera os dados do cliente (só o tratamento do pedido)');
console.log('✔ privacidade e permissões (público, outro negócio, equipa)');

// tratamento: o preço só é visível ao cliente depois de enviado o orçamento
const track = async (tok: string) => (await asUser(db, 'anon', () => db.query<{ t: MoveTrack }>('select get_move_request($1) t', [tok]))).rows[0].t;
let tr = await track(a.public_token); assert.equal(tr.status, 'new'); assert.equal(tr.quoted_minor, null); assert.equal(tr.origin_city, 'Lisboa'); assert.equal(tr.tenant_slug, 'mudancas-rapidas'); assert.equal(tr.can_respond, false); assert.equal(tr.customer_first_name, 'Maria');
const upd = (who: string, sql: string, p: unknown[]) => asUser(db, who, () => db.query(sql, p));
await upd(staff, `update move_requests set quoted_minor=95000, quote_note='Inclui embalagem' where id=$1`, [own]);
assert.equal((await track(a.public_token)).quoted_minor, null, 'preço preenchido mas ainda não enviado: o cliente não vê');
assert.equal(await err(() => upd(staff, `update move_requests set status='quoted', quoted_minor=null where id=$1`, [own])), 'quote_required', 'não se envia orçamento sem preço');
await upd(staff, `update move_requests set status='quoted' where id=$1`, [own]);
tr = await track(a.public_token); assert.equal(tr.quoted_minor, 95000); assert.equal(tr.quote_note, 'Inclui embalagem'); assert.equal(tr.can_respond, true);
assert.equal(await err(() => upd(staff, `update move_requests set status='confirmed' where id=$1`, [own])), 'date_required', 'confirmar exige data');
const respond = (tok: string, ok: boolean) => asUser(db, 'anon', () => db.query<{ r: MoveTrack }>('select respond_move_quote($1,$2) r', [tok, ok]));
assert.equal((await respond(a.public_token, true)).rows[0].r.status, 'accepted');
assert.equal(await err(() => respond(a.public_token, true)), 'cannot_respond', 'só responde uma vez');
await upd(owner, `update move_requests set status='confirmed', confirmed_date=$2, confirmed_window='morning', crew='Equipa A' where id=$1`, [own, plus(20)]);
tr = await track(a.public_token); assert.equal(tr.status, 'confirmed'); assert.equal(tr.confirmed_date, plus(20)); assert.equal(tr.confirmed_window, 'morning');
// o segundo pedido: o cliente recusa
const own2 = (await db.query<{ id: string }>('select id from move_requests where number=1002 and tenant_id=$1', [tid])).rows[0].id;
await upd(owner, `update move_requests set quoted_minor=80000, status='quoted' where id=$1`, [own2]);
assert.equal((await respond(b.public_token, false)).rows[0].r.status, 'lost');
await upd(owner, `update move_requests set status='new' where id=$1`, [own2]); // um pedido perdido pode ser reaberto
console.log('✔ orçamento: preço só visível depois de enviado; aceitar/recusar; confirmar exige data; reabrir perdido');

// capacidade por dia (2 mudanças confirmadas = dia cheio) e dia concluído final
const load = async () => (await asUser(db, 'anon', () => db.query<{ l: { capacity: number; days: { day: string; jobs: number }[] } }>(`select move_day_load('mudancas-rapidas',$1::date,$2::date) l`, [today, plus(60)]))).rows[0].l;
let l = await load(); assert.equal(l.capacity, 2); assert.deepEqual(l.days, [{ day: plus(20), jobs: 1 }]);
const c3 = await submit(form({ phone: '916000004', name: 'Ana Dias' })); const own3 = (await db.query<{ id: string }>('select id from move_requests where number=$1 and tenant_id=$2', [c3.number, tid])).rows[0].id;
await upd(owner, `update move_requests set quoted_minor=70000, status='confirmed', confirmed_date=$2 where id=$1`, [own3, plus(20)]);
l = await load(); assert.equal(l.days[0].jobs, 2, 'dois confirmados no mesmo dia = cheio'); const full = l.days.filter((d) => d.jobs >= l.capacity).map((d) => d.day);
assert.equal(buildMoveRequest(form({ preferredDate: plus(20) }), { ...ctx, fullDays: full }).ok, false, 'o formulário bloqueia o dia cheio');
assert.equal((await asUser(db, 'anon', () => db.query<{ l: null }>('select move_day_load($1,$2::date,$3::date) l', ['nao-existe', today, plus(3)]))).rows[0].l, null, 'loja inexistente');
await upd(owner, `update move_requests set status='done' where id=$1`, [own]);
assert.equal(await err(() => upd(owner, `update move_requests set status='new' where id=$1`, [own])), 'final_status', 'concluído é final');
console.log('✔ capacidade por dia bloqueia dias cheios; concluído é final');

// exportação para Excel a partir dos dados reais
const all = (await asUser(db, owner, () => db.query<MoveRow>('select *, volume_m3::float8 as volume_m3, quoted_minor::float8 as quoted_minor, created_at::text as created_at from move_requests where tenant_id=$1 order by number', [tid]))).rows;
const H = { number: 'Nº', status: 'Estado', created: 'Pedido em', name: 'Nome', phone: 'Telefone', email: 'Email', type: 'Tipo', volume: 'm³', origin: 'Origem', originFloor: 'Andar origem', originElevator: 'Elevador origem', destination: 'Destino', destFloor: 'Andar destino', destElevator: 'Elevador destino', extras: 'Extras', special: 'Itens especiais', preferred: 'Data preferida', window: 'Horário', price: 'Preço', confirmed: 'Data confirmada', crew: 'Equipa', notes: 'Observações', internal: 'Notas internas', yes: 'Sim', no: 'Não' };
const csv = movesToCsv(all, H, { money: (n) => `${(n / 100).toFixed(2).replace('.', ',')} €`, status: (s) => s, type: (x) => x, window: (w) => w, date: (i) => i.slice(0, 10) });
const lines = csv.replace('\ufeff', '').split('\r\n'); assert.equal(csv.charCodeAt(0), 0xfeff, 'BOM para o Excel'); assert.equal(lines.length, all.length + 1);
assert.match(lines[0], /^Nº;Estado;Pedido em;Nome;/); assert.match(lines[1], /^1001;done;/); assert.match(lines[1], /;45,5;/); assert.match(lines[1], /950,00 €/); assert.match(lines[1], /"Piano de cauda no 3º andar, sem elevador"|Piano de cauda no 3º andar, sem elevador/);
assert.ok(lines[1].includes('Rua das Flores 10, 1200-123, Lisboa'));
const tricky = movesToCsv([{ ...all[0], customer_name: 'Ana "Nina"; Silva', notes: 'linha1\nlinha2' }], H, { money: String, status: (s) => s, type: (x) => x, window: (w) => w, date: (i) => i.slice(0, 10) });
assert.match(tricky, /"Ana ""Nina""; Silva"/); assert.match(tricky, /"linha1\nlinha2"/);
console.log('✔ exportação CSV (Excel PT: separador ";", BOM, aspas e quebras de linha)');
process.exit(0);
