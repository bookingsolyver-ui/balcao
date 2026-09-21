// Fidelidade: validação + fluxo completo contra o Postgres real (balcão, resgate, ajuste, cartão do cliente).
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { buildEarn, buildProgram, canRedeem, progressPct, toProgramForm, type EarnForm, type LoyaltyCardData, type LoyaltyProgram } from '../src/lib/loyalty';
import { dbErrorKey } from '../src/lib/errors';
import { makeDb, asUser } from './helpers/pg';

const ctx = (over = {}) => ({ tenantId: 't', country: 'AO', currency: 'AOA', decimals: 2, mode: 'stamps' as const, isKnown: false, ...over });
const f: EarnForm = { phone: '923 306 869', name: 'Ana Silva', amount: '' };

// ---- validação ----
let r = buildEarn(f, ctx()); assert.ok(r.ok && r.params.p_phone === '244923306869' && r.params.p_amount_minor === 0);
r = buildEarn({ ...f, amount: '1500,50' }, ctx()); assert.ok(r.ok && r.params.p_amount_minor === 150050);
assert.deepEqual(buildEarn({ ...f, phone: '12' }, ctx()), { ok: false, error: 'phone' });
assert.deepEqual(buildEarn({ ...f, name: '' }, ctx()), { ok: false, error: 'name' });
assert.ok(buildEarn({ ...f, name: '' }, ctx({ isKnown: true })).ok, 'cliente conhecido não precisa de nome');
assert.deepEqual(buildEarn({ ...f, amount: 'abc' }, ctx()), { ok: false, error: 'amount' });
assert.deepEqual(buildEarn({ ...f, amount: '' }, ctx({ mode: 'points' })), { ok: false, error: 'amount' }, 'pontos exigem o valor da compra');
assert.deepEqual(buildEarn({ ...f, amount: '-3' }, ctx()), { ok: false, error: 'amount' });
const prog: LoyaltyProgram = { mode: 'stamps', goal: 8, reward: '1 corte grátis', points_per_unit: 1, min_purchase_minor: 0, auto_earn: true };
const pf = toProgramForm(prog, 2); assert.equal(pf.goal, '8'); assert.equal(pf.min, '0.00');
let p = buildProgram({ ...pf, goal: '10', reward: ' Vale ', min: '500' }, { currency: 'AOA', decimals: 2 }); assert.ok(p.ok && p.value.goal === 10 && p.value.reward === 'Vale' && p.value.min_purchase_minor === 50000);
assert.deepEqual(buildProgram({ ...pf, goal: '0' }, { currency: 'AOA', decimals: 2 }), { ok: false, error: 'goal' });
assert.deepEqual(buildProgram({ ...pf, goal: '1001' }, { currency: 'AOA', decimals: 2 }), { ok: false, error: 'goal' });
assert.deepEqual(buildProgram({ ...pf, reward: '  ' }, { currency: 'AOA', decimals: 2 }), { ok: false, error: 'reward' });
assert.deepEqual(buildProgram({ ...pf, mode: 'points', rate: '0' }, { currency: 'AOA', decimals: 2 }), { ok: false, error: 'rate' });
p = buildProgram({ ...pf, mode: 'points', rate: '1,5' }, { currency: 'AOA', decimals: 2 }); assert.ok(p.ok && p.value.points_per_unit === 1.5);
assert.deepEqual(buildProgram({ ...pf, min: 'x' }, { currency: 'AOA', decimals: 2 }), { ok: false, error: 'min' });
assert.equal(progressPct(3, 8), 38); assert.equal(progressPct(20, 8), 100); assert.equal(canRedeem(8, 8), true); assert.equal(canRedeem(7, 8), false);
console.log('✔ validação de fidelidade (pontuar e programa)');

// ---- contra o Postgres real ----
const db = await makeDb();
const owner = randomUUID(), staff = randomUUID(), stranger = randomUUID();
await db.query('insert into auth.users(id) values ($1),($2),($3)', [owner, staff, stranger]);
const tid = (await asUser(db, owner, () => db.query<{ id: string }>(`select create_tenant('salao','Salão Bela','salon','AOA',2,'pt-PT','Africa/Luanda','AO','244923306869') id`))).rows[0].id;
await db.query(`insert into tenant_members(tenant_id,user_id,role) values ($1,$2,'staff')`, [tid, staff]);
const c = (over = {}) => ctx({ tenantId: tid, ...over });
const earn = async (who: string, form: EarnForm, cx = c()) => {
  const b = buildEarn(form, cx); if (!b.ok) throw new Error('form ' + b.error);
  const q = b.params; return (await asUser(db, who, () => db.query<{ r: { ok: boolean; error?: string; delta?: number; balance?: number; goal?: number; reward_ready?: boolean; customer_id?: string } }>('select loyalty_earn($1,$2,$3,$4,$5) r', [q.p_tenant, q.p_phone, q.p_name, q.p_amount_minor, q.p_note]))).rows[0].r;
};
const rows = async () => (await db.query<{ id: string; name: string; balance: number; phone: string }>('select id,name,balance,phone from loyalty_customers where tenant_id=$1', [tid])).rows;

const e1 = await earn(staff, f); // a equipa (staff) também pontua no balcão
assert.ok(e1.ok && e1.delta === 1 && e1.balance === 1 && e1.goal === 6, 'salão: meta de 6 carimbos');
assert.equal((await rows())[0].phone, '244923306869');
for (let i = 0; i < 5; i++) await earn(owner, { ...f, name: '' }, c({ isKnown: true }));
const last = await earn(owner, { ...f, name: '' }, c({ isKnown: true })); assert.equal(last.balance, 7); assert.equal(last.reward_ready, true);
console.log('✔ carimbos no balcão por telefone (owner e staff); meta atingida');

const cust = (await rows())[0];
assert.equal((await asUser(db, staff, () => db.query<{ r: { balance: number } }>('select loyalty_redeem($1) r', [cust.id]))).rows[0].r.balance, 1, 'resgate desconta a meta (7 - 6)');
const noBal = await asUser(db, owner, () => db.query('select loyalty_redeem($1)', [cust.id])).then(() => null, (e) => dbErrorKey(e as never)); assert.equal(noBal, 'not_enough_balance');
assert.equal((await asUser(db, owner, () => db.query<{ r: { balance: number } }>('select loyalty_adjust($1,$2,$3) r', [cust.id, 4, 'correção']))).rows[0].r.balance, 5);
assert.equal(await asUser(db, staff, () => db.query('select loyalty_adjust($1,$2,$3)', [cust.id, 1, 'x'])).then(() => null, (e) => dbErrorKey(e as never)), 'forbidden', 'staff não ajusta saldos');
assert.equal(await asUser(db, stranger, () => db.query('select loyalty_redeem($1)', [cust.id])).then(() => null, (e) => dbErrorKey(e as never)), 'forbidden', 'outro negócio não resgata');
const hist = (await asUser(db, owner, () => db.query<{ kind: string; delta: number }>('select kind,delta from loyalty_events where customer_id=$1 order by created_at,id', [cust.id]))).rows;
assert.ok(hist.some((h) => h.kind === 'redeem' && h.delta === -6) && hist.some((h) => h.kind === 'adjust' && h.delta === 4) && hist.some((h) => h.kind === 'join'));
console.log('✔ resgate, ajuste (só admin) e histórico');

// programa: só owner/admin alteram; pontos com valor da compra em Kz
const np = buildProgram({ ...toProgramForm({ mode: 'stamps', goal: 6, reward: 'x', points_per_unit: 1, min_purchase_minor: 0, auto_earn: true }, 2), mode: 'points', goal: '100', rate: '0,01', reward: 'Vale de 1 000 Kz', min: '' }, { currency: 'AOA', decimals: 2 });
assert.ok(np.ok);
if (np.ok) {
  const upd = (who: string) => asUser(db, who, () => db.query('update loyalty_programs set mode=$2, goal=$3, reward=$4, points_per_unit=$5, min_purchase_minor=$6, auto_earn=$7 where tenant_id=$1', [tid, np.value.mode, np.value.goal, np.value.reward, np.value.points_per_unit, np.value.min_purchase_minor, np.value.auto_earn])).then((r) => r.affectedRows ?? 0);
  assert.equal(await upd(staff), 0, 'staff não altera o programa'); assert.equal(await upd(owner), 1);
}
const pe = await earn(owner, { phone: '923 111 222', name: 'Rui', amount: '25000' }, c({ mode: 'points' })); // 25 000 Kz × 0,01 = 250 pontos
assert.ok(pe.ok && pe.delta === 250 && pe.reward_ready === true, `pontos por valor (${pe.delta})`);
assert.equal((await asUser(db, owner, () => db.query<{ r: { ok: boolean; error: string } }>('select loyalty_earn($1,$2,$3,$4) r', [tid, '244923111333', 'Zé', 0]))).rows[0].r.error, 'no_points', 'sem valor não há pontos');
console.log('✔ programa em pontos por valor (Kz) e permissões');

// cartão do cliente (público)
await db.query(`update loyalty_programs set mode='stamps', goal=6, reward='1 corte grátis', points_per_unit=1 where tenant_id=$1`, [tid]);
const card = async (phone: string) => (await asUser(db, 'anon', () => db.query<{ c: LoyaltyCardData }>('select loyalty_card($1,$2) c', ['salao', phone]))).rows[0].c;
let cd = await card('244923306869'); assert.ok(cd.found && cd.first_name === 'Ana' && cd.balance === 5 && cd.mode === 'stamps' && (cd.history?.length ?? 0) >= 4, 'cartão com histórico');
cd = await card('244999000111'); assert.equal(cd.found, false); assert.equal(cd.goal, 6); assert.equal(cd.reward, '1 corte grátis');
const join = await asUser(db, 'anon', () => db.query<{ j: LoyaltyCardData }>('select loyalty_join($1,$2,$3) j', ['salao', 'Nova Cliente', '244999000111']));
assert.ok(join.rows[0].j.found && join.rows[0].j.balance === 0 && join.rows[0].j.first_name === 'Nova');
await asUser(db, 'anon', () => db.query('select loyalty_join($1,$2,$3)', ['salao', 'Outro Nome', '244999000111']));
assert.equal((await rows()).filter((x) => x.phone === '244999000111').length, 1, 'entrar duas vezes não duplica');
assert.equal(await asUser(db, 'anon', () => db.query('select loyalty_join($1,$2,$3)', ['salao', 'X', '12'])).then(() => null, (e) => dbErrorKey(e as never)), 'invalid_phone');
const listed = await asUser(db, 'anon', async () => { try { return (await db.query<{ n: number }>('select count(*)::int n from loyalty_customers')).rows[0].n; } catch { return 0; } }); // erro de permissão também conta como "não vê"
assert.equal(listed, 0, 'público não lista clientes');
console.log('✔ cartão do cliente: consultar, entrar sem duplicar, telefone inválido, sem listar clientes');
process.exit(0);
