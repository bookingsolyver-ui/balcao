// Avaliações públicas de negócios reais: validação, e a segurança toda contra Postgres real.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { buildReview, emptyReviewForm, toReviewForm } from '../src/lib/reviews';
import { makeDb, asUser } from './helpers/pg';

// ---- validação ----
const f = { rating: 5, body: 'O Balcão poupou-nos horas de WhatsApp todos os dias.', authorName: 'Maria, Perola&Charme' };
let r = buildReview(f); assert.ok(r.ok);
assert.deepEqual(buildReview({ ...f, rating: 0 }), { ok: false, error: 'rating' });
assert.deepEqual(buildReview({ ...f, rating: 6 }), { ok: false, error: 'rating' });
assert.deepEqual(buildReview({ ...f, rating: 3.5 }), { ok: false, error: 'rating' });
assert.deepEqual(buildReview({ ...f, body: 'curto' }), { ok: false, error: 'body' });
assert.deepEqual(buildReview({ ...f, body: 'x'.repeat(501) }), { ok: false, error: 'body' });
assert.deepEqual(buildReview({ ...f, authorName: 'M' }), { ok: false, error: 'author_name' });
const empty = emptyReviewForm('Mudanças Rápidas'); assert.equal(empty.rating, 5); assert.equal(empty.authorName, 'Mudanças Rápidas'); assert.equal(empty.body, '');
const filled = toReviewForm({ id: '1', rating: 4, body: 'Muito bom.', author_name: 'João', created_at: '2026-01-01' }, 'Sugestão');
assert.deepEqual(filled, { rating: 4, body: 'Muito bom.', authorName: 'João' });
console.log('✔ validação da avaliação (nota, texto, nome)');

// ---- contra o Postgres real ----
const db = await makeDb();
const owner = randomUUID(), staff = randomUUID(), stranger = randomUUID();
await db.query('insert into auth.users(id) values ($1),($2),($3)', [owner, staff, stranger]);
const tid = (await asUser(db, owner, () => db.query<{ id: string }>(`select create_tenant('mudancas-t','Mudanças Teste','moving','EUR',2,'pt-PT','Europe/Lisbon','PT','351911111111') id`))).rows[0].id;
await db.query(`insert into tenant_members(tenant_id,user_id,role) values ($1,$2,'staff')`, [tid, staff]);
const err = (fn: () => Promise<unknown>) => fn().then(() => null, (e) => /permission denied|row-level security/.test((e as Error).message) ? 'forbidden' : (e as Error).message);

const insertReview = (who: string, forTenant = tid, v = { rating: 5, body: 'Excelente, poupa horas por semana.', author_name: 'Ana' }) =>
  asUser(db, who, () => db.query<{ id: string }>('insert into reviews(tenant_id,rating,body,author_name) values ($1,$2,$3,$4) returning id', [forTenant, v.rating, v.body, v.author_name]));

assert.equal(await err(() => insertReview(staff)), 'forbidden', 'staff não representa o negócio publicamente: não escreve avaliação');
assert.equal(await err(() => insertReview(stranger)), 'forbidden', 'quem não é do negócio, nem pensar');
const ins = await insertReview(owner); assert.ok(ins.rows[0].id, 'owner consegue deixar a avaliação do seu negócio');
const rid = ins.rows[0].id;
console.log('✔ só o dono/admin do negócio consegue escrever a avaliação');

const dup = await insertReview(owner).then(() => 'passou', (e) => (e as Error).message);
assert.notEqual(dup, 'passou', 'a segunda tentativa do mesmo negócio tem de falhar (uma avaliação só)');
console.log('✔ um negócio só pode deixar uma avaliação (não pode duplicar)');

// público: só vê o que está visível, nunca o tenant_id
const pub1 = await asUser(db, 'anon', () => db.query<{ id: string; author_name: string }>('select id, author_name from reviews'));
assert.equal(pub1.rows.length, 1, 'o público já vê a avaliação (visible=true por defeito)');
await db.query(`update reviews set visible=false where id=$1`, [rid]); // simula o "esconder" que só nós fazemos, direto na base
const pub2 = await asUser(db, 'anon', () => db.query('select id from reviews'));
assert.equal(pub2.rows.length, 0, 'escondida: o público deixa de a ver');
const ownerSees = await asUser(db, owner, () => db.query('select id from reviews where tenant_id=$1', [tid]));
assert.equal(ownerSees.rows.length, 1, 'mas o dono continua a vê-la (sabe que está escondida)');
await db.query(`update reviews set visible=true where id=$1`, [rid]);
console.log('✔ esconder uma avaliação tira-a do público sem a apagar; o dono continua a vê-la');

// ninguém, nem o dono, consegue tornar-se visível/invisível sozinho (a coluna "visible" não está no grant de update)
assert.equal(await err(() => asUser(db, owner, () => db.query(`update reviews set visible=false where id=$1`, [rid]))), 'forbidden', 'só nós escondemos avaliações, nunca o próprio negócio');
console.log('✔ o negócio não consegue esconder/mostrar a sua própria avaliação sozinho');

// editar: o dono pode; outro negócio não pode editar a avaliação alheia
await asUser(db, owner, () => db.query(`update reviews set body=$2 where id=$1`, [rid, 'Texto atualizado, continua excelente.']));
const tid2 = (await asUser(db, stranger, () => db.query<{ id: string }>(`select create_tenant('outro-t','Outro Negócio','moving','EUR',2,'pt-PT','Europe/Lisbon','PT','351922222222') id`))).rows[0].id;
assert.equal(await err(() => insertReview(stranger, tid, { rating: 1, body: 'nada a ver com este negócio', author_name: 'Zé' })), 'forbidden', 'stranger não é membro de tid: não pode deixar avaliação nele');
assert.equal(await err(() => insertReview(stranger, tid2, { rating: 4, body: 'A minha própria avaliação, do meu negócio.', author_name: 'Zé' })), null, 'mas consegue deixar a avaliação DO SEU PRÓPRIO negócio');
assert.equal((await asUser(db, owner, () => db.query<{ body: string }>('select body from reviews where id=$1', [rid]))).rows[0].body, 'Texto atualizado, continua excelente.');
console.log('✔ o dono edita a sua avaliação; negócios diferentes não se confundem');

// apagar: o próprio dono pode remover a sua avaliação
await asUser(db, owner, () => db.query('delete from reviews where id=$1', [rid]));
assert.equal((await asUser(db, owner, () => db.query('select id from reviews where tenant_id=$1', [tid]))).rows.length, 0);
console.log('✔ o dono consegue apagar a própria avaliação');
process.exit(0);
