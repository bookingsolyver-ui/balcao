// Convite de equipa: o dono cria, a pessoa aceita sozinha (sem mexer no Supabase), e liga-se ao prestador de serviço certo.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { makeDb, asUser } from './helpers/pg';

const db = await makeDb();
const owner = randomUUID(), staffUser = randomUUID(), stranger = randomUUID(), otherOwner = randomUUID();
await db.query('insert into auth.users(id) values ($1),($2),($3),($4)', [owner, staffUser, stranger, otherOwner]);
const tid = (await asUser(db, owner, () => db.query<{ id: string }>(`select create_tenant('salao-t','Salão Teste','salon','EUR',2,'pt-PT','Europe/Lisbon','PT','351911111111') id`))).rows[0].id;
const marta = (await db.query<{ id: string }>(`insert into staff(tenant_id,name) values ($1,'Marta') returning id`, [tid])).rows[0].id;
const err = (fn: () => Promise<unknown>) => fn().then(() => null, (e) => {
  const m = (e as Error).message;
  return /permission denied|row-level security/.test(m) ? 'forbidden' : m;
});

// ---- criar convite: só owner/admin, nunca para "owner" ----
assert.equal(await err(() => asUser(db, staffUser, () => db.query('select create_invite($1,$2,$3)', [tid, 'staff', null]))), 'forbidden', 'staff comum não convida ninguém');
const created = await asUser(db, owner, () => db.query<{ create_invite: { code: string } }>('select create_invite($1,$2,$3) create_invite', [tid, 'staff', marta]));
const code = created.rows[0].create_invite.code;
assert.equal(code.length, 8, 'código de 8 caracteres'); assert.doesNotMatch(code, /[01OIL]/, 'sem caracteres ambíguos');
assert.equal(await err(() => asUser(db, owner, () => db.query('select create_invite($1,$2,$3)', [tid, 'owner', null]))), 'invalid_role', 'nunca se convida outro dono');
console.log('✔ só owner/admin cria convites; nunca para "owner"; código sem caracteres ambíguos');

// ---- pré-visualizar (antes de aceitar, sem sessão nenhuma) ----
const prev = await asUser(db, 'anon', () => db.query<{ invite_preview: { tenant_name: string; role: string; staff_name: string; valid: boolean } }>('select invite_preview($1) invite_preview', [code]));
assert.deepEqual(prev.rows[0].invite_preview, { tenant_name: 'Salão Teste', role: 'staff', staff_name: 'Marta', valid: true });
const noPrev = await asUser(db, 'anon', () => db.query<{ invite_preview: null }>('select invite_preview($1) invite_preview', ['XXXXXXXX']));
assert.equal(noPrev.rows[0].invite_preview, null, 'código inexistente: nada a mostrar, sem erro');
console.log('✔ pré-visualização pública (nome do negócio, papel, prestador) sem precisar de sessão');

// ---- aceitar: liga o login à Marta, dá o papel certo ----
const acc = await asUser(db, staffUser, () => db.query<{ accept_invite: { tenant_slug: string; already_member: boolean } }>('select accept_invite($1) accept_invite', [code]));
assert.deepEqual(acc.rows[0].accept_invite, { tenant_slug: 'salao-t', already_member: false });
const role = (await asUser(db, staffUser, () => db.query<{ role: string }>('select role from tenant_members where tenant_id=$1 and user_id=$2', [tid, staffUser]))).rows[0];
assert.equal(role.role, 'staff');
const staffRow = (await asUser(db, staffUser, () => db.query<{ user_id: string }>('select user_id from staff where id=$1', [marta]))).rows[0];
assert.equal(staffRow.user_id, staffUser, 'a Marta (prestadora) ficou ligada a este login');
console.log('✔ aceitar o convite: entra na equipa com o papel certo, e fica ligado à Marta na agenda');

// ---- não se pode reutilizar, nem usar sem sentido ----
assert.equal(await err(() => asUser(db, stranger, () => db.query('select accept_invite($1)', [code]))), 'already_used', 'já foi usado, ninguém mais entra com o mesmo código');
assert.equal(await err(() => asUser(db, stranger, () => db.query('select accept_invite($1)', ['XXXXXXXX']))), 'invalid_code', 'código que nunca existiu');
const already = await asUser(db, staffUser, () => db.query<{ accept_invite: { already_member: boolean } }>('select accept_invite($1) accept_invite', [code]).catch(async () => {
  // gera um convite novo válido para o mesmo utilizador, já membro, para testar o caso "já é membro"
  const c2 = (await asUser(db, owner, () => db.query<{ create_invite: { code: string } }>('select create_invite($1,$2,$3) create_invite', [tid, 'staff', null]))).rows[0].create_invite.code;
  return asUser(db, staffUser, () => db.query<{ accept_invite: { already_member: boolean } }>('select accept_invite($1) accept_invite', [c2]));
}));
assert.equal(already.rows[0].accept_invite.already_member, true, 'já é membro: não duplica, só confirma');
console.log('✔ não dá para reutilizar um código, nem faz mal tentar aceitar sendo já membro');

// ---- expirado ----
const cExp = (await asUser(db, owner, () => db.query<{ create_invite: { code: string } }>('select create_invite($1,$2,$3) create_invite', [tid, 'staff', null]))).rows[0].create_invite.code;
await db.query(`update tenant_invites set expires_at = now() - interval '1 hour' where code=$1`, [cExp]);
assert.equal(await err(() => asUser(db, stranger, () => db.query('select accept_invite($1)', [cExp]))), 'expired', 'código expirado: recusa');
console.log('✔ código expirado (mais de 7 dias) já não funciona');

// ---- isolamento entre negócios: um convite de um negócio nunca junta alguém a outro ----
const tid2 = (await asUser(db, otherOwner, () => db.query<{ id: string }>(`select create_tenant('outro-salao','Outro Salão','salon','EUR',2,'pt-PT','Europe/Lisbon','PT','351922222222') id`))).rows[0].id;
const c3 = (await asUser(db, otherOwner, () => db.query<{ create_invite: { code: string } }>('select create_invite($1,$2,$3) create_invite', [tid2, 'admin', null]))).rows[0].create_invite.code;
const acc3 = await asUser(db, stranger, () => db.query<{ accept_invite: { tenant_slug: string } }>('select accept_invite($1) accept_invite', [c3]));
assert.equal(acc3.rows[0].accept_invite.tenant_slug, 'outro-salao');
assert.equal((await asUser(db, stranger, () => db.query('select 1 from tenant_members where tenant_id=$1 and user_id=$2', [tid, stranger]))).rows.length, 0, 'não entrou no negócio errado');
console.log('✔ cada convite é só para o negócio dele — nunca se confunde');

// ---- ligar a um prestador já ligado a outra pessoa: recusa (staff_id não existe nesse tenant, ou já tem dono) ----
assert.equal(await err(() => asUser(db, owner, () => db.query('select create_invite($1,$2,$3)', [tid, 'staff', randomUUID()]))), 'staff_not_found', 'prestador que não existe: recusa logo ao criar');
process.exit(0);
