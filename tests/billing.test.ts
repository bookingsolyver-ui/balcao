// Faturação do Balcão às empresas: estado da subscrição, assinatura dos eventos do Paddle,
// e a base de dados (o público e outros negócios nunca veem isto; só o service_role escreve).
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { randomUUID } from 'node:crypto';
import { billingUpdateFromEvent, daysLeft, isBillingOk, trialExpired, verifyPaddleSignature, type BillingRow, type PaddleEvent } from '../src/lib/billing';
import { makeDb, asUser } from './helpers/pg';

// ---- semântica dos estados ----
assert.equal(isBillingOk('trialing'), true); assert.equal(isBillingOk('active'), true); assert.equal(isBillingOk('past_due'), true);
assert.equal(isBillingOk('paused'), false); assert.equal(isBillingOk('canceled'), false);
const row = (over: Partial<BillingRow> = {}): BillingRow => ({ tenant_id: 't', status: 'trialing', plan: 'standard', paddle_customer_id: null, paddle_subscription_id: null, trial_ends_at: null, current_period_end: null, ...over });
const now = new Date('2026-09-24T12:00:00Z');
assert.equal(trialExpired(row({ trial_ends_at: '2026-09-20T00:00:00Z' }), now), true, 'avaliação já passou');
assert.equal(trialExpired(row({ trial_ends_at: '2026-10-01T00:00:00Z' }), now), false, 'ainda dentro do prazo');
assert.equal(trialExpired(row({ status: 'active', trial_ends_at: '2026-09-20T00:00:00Z' }), now), false, 'já pagou: não conta como avaliação expirada');
assert.equal(trialExpired(row({ trial_ends_at: null }), now), false, 'sem data, nunca expira sozinha');
assert.equal(daysLeft('2026-09-27T12:00:00Z', now), 3); assert.equal(daysLeft('2026-09-24T11:00:00Z', now), 0, 'já passou, nunca negativo'); assert.equal(daysLeft(null, now), null);
console.log('✔ semântica dos estados de faturação');

// ---- assinatura do Paddle ----
const secret = 'segredo-de-teste-123';
const sign = (body: string, ts: number, s = secret) => `ts=${ts};h1=${createHmac('sha256', s).update(`${ts}:${body}`).digest('hex')}`;
const body = JSON.stringify({ event_type: 'subscription.updated', data: { id: 'sub_1' } });
const nowSec = Math.floor(now.getTime() / 1000);
assert.deepEqual(verifyPaddleSignature(body, sign(body, nowSec), secret, now), { ok: true });
assert.deepEqual(verifyPaddleSignature(body, null, secret, now), { ok: false, reason: 'missing_header' });
assert.deepEqual(verifyPaddleSignature(body, 'lixo-sem-formato', secret, now), { ok: false, reason: 'malformed_header' });
assert.deepEqual(verifyPaddleSignature(body, `ts=abc;h1=${'0'.repeat(64)}`, secret, now), { ok: false, reason: 'malformed_header' });
assert.deepEqual(verifyPaddleSignature(body, sign(body, nowSec), 'segredo-errado', now), { ok: false, reason: 'bad_signature' });
assert.deepEqual(verifyPaddleSignature(body + 'X', sign(body, nowSec), secret, now), { ok: false, reason: 'bad_signature' }, 'corpo alterado depois de assinado: recusa');
assert.deepEqual(verifyPaddleSignature(body, sign(body, nowSec - 600), secret, now), { ok: false, reason: 'too_old' }, 'reenvio de há 10 minutos: recusa');
assert.equal(verifyPaddleSignature(body, sign(body, nowSec - 60), secret, now).ok, true, 'há 1 minuto: aceita');
console.log('✔ assinatura do Paddle: aceita a válida, recusa corpo alterado, segredo errado e reenvios antigos');

// ---- evento -> atualização a gravar ----
const ev = (over: Partial<PaddleEvent['data']> = {}, type = 'subscription.updated'): PaddleEvent => ({ event_type: type, data: { id: 'sub_1', customer_id: 'ctm_1', status: 'active', current_billing_period: { ends_at: '2026-10-24T12:00:00Z' }, custom_data: { tenant_id: 't1' }, ...over } });
assert.deepEqual(billingUpdateFromEvent(ev()), { tenant_id: 't1', status: 'active', paddle_customer_id: 'ctm_1', paddle_subscription_id: 'sub_1', current_period_end: '2026-10-24T12:00:00Z' });
assert.equal(billingUpdateFromEvent(ev({}, 'transaction.completed')), null, 'só nos interessam eventos subscription.*');
assert.equal(billingUpdateFromEvent(ev({ custom_data: null })), null, 'sem tenant_id não há o que gravar');
assert.equal(billingUpdateFromEvent(ev({ status: 'qualquer_coisa' })), null, 'estado desconhecido do Paddle: ignora em vez de gravar lixo');
assert.equal(billingUpdateFromEvent(ev({ status: 'canceled' }, 'subscription.canceled'))?.status, 'canceled');
assert.equal(billingUpdateFromEvent(ev({ current_billing_period: null }))?.current_period_end, null);
console.log('✔ mapeamento de eventos do Paddle para atualizações');

// ---- contra o Postgres real: o gatilho, e quem pode ver/escrever ----
const db = await makeDb();
const owner = randomUUID(), staff = randomUUID(), stranger = randomUUID();
await db.query('insert into auth.users(id) values ($1),($2),($3)', [owner, staff, stranger]);
const tid = (await asUser(db, owner, () => db.query<{ id: string }>(`select create_tenant('mudancas-t','Mudanças Teste','moving','EUR',2,'pt-PT','Europe/Lisbon','PT','351911111111') id`))).rows[0].id;
await db.query(`insert into tenant_members(tenant_id,user_id,role) values ($1,$2,'staff')`, [tid, staff]);

const bill = (await asUser(db, owner, () => db.query<{ status: string; trial_ends_at: string; plan: string }>('select status, trial_ends_at, plan from tenant_billing where tenant_id=$1', [tid]))).rows[0];
assert.equal(bill.status, 'trialing'); assert.equal(bill.plan, 'standard');
const trialDays = Math.round((new Date(bill.trial_ends_at).getTime() - Date.now()) / 86400000);
assert.ok(trialDays >= 2 && trialDays <= 3, `avaliação de ~3 dias (deu ${trialDays})`);
console.log('✔ negócio novo nasce automaticamente com 3 dias de avaliação');

const err = (fn: () => Promise<unknown>) => fn().then(() => null, (e) => (e as Error).message.includes('permission denied') ? 'forbidden' : (e as Error).message);
assert.equal((await asUser(db, staff, () => db.query('select status from tenant_billing where tenant_id=$1', [tid]))).rows.length, 1, 'a equipa também vê o estado do seu próprio negócio');
assert.equal((await asUser(db, stranger, () => db.query('select status from tenant_billing where tenant_id=$1', [tid]))).rows.length, 0, 'outro utilizador não vê nada (a linha existe, mas fica invisível)');
assert.equal(await err(() => asUser(db, 'anon', () => db.query('select status from tenant_billing where tenant_id=$1', [tid]))), 'forbidden', 'o público (visitante da loja) nunca vê o estado de faturação — nem sequer tem autorização na tabela');

assert.equal(await err(() => asUser(db, owner, () => db.query(`update tenant_billing set status='active' where tenant_id=$1`, [tid]))), 'forbidden', 'nem o dono do negócio consegue marcar-se a si próprio como pago');
assert.equal(await err(() => asUser(db, owner, () => db.query(`insert into tenant_billing(tenant_id,status) values ($1,'active') on conflict (tenant_id) do nothing`, [randomUUID()]))), 'forbidden');
console.log('✔ só o público lê o que deve, e ninguém escreve exceto o servidor');

// simula o que o recetor de eventos faz (liga sem "asUser" = privilégios totais, como o service_role)
await db.query(`update tenant_billing set status='active', paddle_customer_id='ctm_1', paddle_subscription_id='sub_1', current_period_end='2026-10-24T12:00:00Z' where tenant_id=$1`, [tid]);
const after = (await asUser(db, owner, () => db.query<{ status: string; paddle_subscription_id: string; updated_at: string; created: string }>(`select status, paddle_subscription_id, updated_at::text, (updated_at > now() - interval '1 minute')::text as created from tenant_billing where tenant_id=$1`, [tid]))).rows[0];
assert.equal(after.status, 'active'); assert.equal(after.paddle_subscription_id, 'sub_1'); assert.equal(after.created, 'true', 'updated_at foi atualizado pelo gatilho');
console.log('✔ o servidor (service_role) consegue mesmo atualizar o estado depois de um pagamento');

// dois negócios diferentes nunca se confundem
const tid2 = (await asUser(db, staff, () => db.query<{ id: string }>(`select create_tenant('mudancas-t2','Outra Empresa','moving','EUR',2,'pt-PT','Europe/Lisbon','PT','351922222222') id`))).rows[0].id;
assert.equal((await asUser(db, owner, () => db.query('select status from tenant_billing where tenant_id=$1', [tid2]))).rows.length, 0, 'o dono do 1º negócio não vê a faturação do 2º');
console.log('✔ isolamento entre negócios diferentes');

// ---- só os primeiros 10 negócios (de sempre) ganham avaliação; o resto nasce "unpaid" ----
// base de dados própria e limpa, para a contagem começar mesmo do zero.
// Espalhado por vários donos (há um limite de 5 negócios por utilizador — regra à parte desta).
const db2 = await makeDb();
const owners = [randomUUID(), randomUUID(), randomUUID()];
for (const o of owners) await db2.query('insert into auth.users(id) values ($1)', [o]);
const ownerOf = (n: number) => owners[Math.floor((n - 1) / 5)];
const mk = (n: number) => asUser(db2, ownerOf(n), () => db2.query<{ id: string }>(`select create_tenant($1,$2,'moving','EUR',2,'pt-PT','Europe/Lisbon','PT','351900000000') id`, [`neg-${n}`, `Negócio ${n}`]));
for (let i = 1; i <= 10; i++) {
  const tidN = (await mk(i)).rows[0].id;
  const b = (await asUser(db2, ownerOf(i), () => db2.query<{ status: string; trial_ends_at: string | null }>('select status, trial_ends_at from tenant_billing where tenant_id=$1', [tidN]))).rows[0];
  assert.equal(b.status, 'trialing', `negócio nº${i}: deveria estar em avaliação`);
  assert.ok(b.trial_ends_at, `negócio nº${i}: deveria ter data de fim de avaliação`);
}
console.log('✔ os primeiros 10 negócios nascem todos em avaliação, com 3 dias');

const tid11 = (await mk(11)).rows[0].id;
const b11 = (await asUser(db2, ownerOf(11), () => db2.query<{ status: string; trial_ends_at: string | null }>('select status, trial_ends_at from tenant_billing where tenant_id=$1', [tid11]))).rows[0];
assert.equal(b11.status, 'unpaid', 'o 11º negócio não tem direito a avaliação');
assert.equal(b11.trial_ends_at, null, 'sem avaliação, sem data de fim');
const tid12 = (await mk(12)).rows[0].id;
const b12 = (await asUser(db2, ownerOf(12), () => db2.query<{ status: string }>('select status from tenant_billing where tenant_id=$1', [tid12]))).rows[0];
assert.equal(b12.status, 'unpaid', 'e todos os seguintes também');
console.log('✔ a partir do 11º negócio, nasce "unpaid" — sem avaliação, tem de subscrever primeiro');
process.exit(0);
