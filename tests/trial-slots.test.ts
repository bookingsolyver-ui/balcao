// Vagas de avaliação restantes: um número público e seguro, sem expor nenhum dado de negócios.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { makeDb, asUser } from './helpers/pg';

const db = await makeDb();
const slots = () => asUser(db, 'anon', () => db.query<{ n: number }>('select trial_slots_left() n')).then((r) => r.rows[0].n);

assert.equal(await slots(), 10, 'sem negócios nenhuns: 10 vagas');

const owners = [randomUUID(), randomUUID(), randomUUID()];
for (const o of owners) await db.query('insert into auth.users(id) values ($1)', [o]);
const ownerOf = (n: number) => owners[Math.floor((n - 1) / 5)];
const mk = (n: number) => asUser(db, ownerOf(n), () => db.query(`select create_tenant($1,$2,'moving','EUR',2,'pt-PT','Europe/Lisbon','PT','351900000000') id`, [`neg-${n}`, `Negócio ${n}`]));

for (let i = 1; i <= 9; i++) {
  await mk(i);
  assert.equal(await slots(), 10 - i, `depois do negócio ${i}: ${10 - i} vagas`);
}
await mk(10);
assert.equal(await slots(), 0, 'depois do 10º negócio: nenhuma vaga');
await mk(11);
assert.equal(await slots(), 0, 'depois do 11º: continua em zero, nunca fica negativo');
console.log('✔ vagas de avaliação: contam certo do 10 até ao 0, nunca ficam negativas');

// é mesmo público — funciona sem sessão nenhuma, como a página de vendas vai chamar
const r = await db.query<{ n: number }>('select trial_slots_left() n');
assert.equal(r.rows[0].n, 0);
console.log('✔ função acessível ao público (sem sessão), como a página de vendas precisa');
process.exit(0);
