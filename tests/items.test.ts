// A lógica de validação do formulário tem de produzir exatamente o que a base de dados aceita.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { buildItemPayload, minorToInput, type ItemForm } from '../src/lib/items';
import { imageUrl } from '../src/lib/storage';
import { makeDb, asUser } from './helpers/pg';

const base: ItemForm = { name: 'Shampoo', description: ' Hidratante ', price: '8500,00', promo: '', stock: '12', emoji: '🧴', categoryId: '', active: true };
const kz = { currency: 'AOA', decimals: 2, module: 'catalog' as const };

// ---- validação ----
let r = buildItemPayload(base, kz);
assert.ok(r.ok); assert.equal(r.ok && r.payload.price_minor, 850000); assert.equal(r.ok && r.payload.description, 'Hidratante'); assert.equal(r.ok && r.payload.stock, 12);
assert.deepEqual(buildItemPayload({ ...base, name: '   ' }, kz), { ok: false, error: 'name' });
assert.deepEqual(buildItemPayload({ ...base, name: 'x'.repeat(121) }, kz), { ok: false, error: 'name' });
assert.deepEqual(buildItemPayload({ ...base, price: 'abc' }, kz), { ok: false, error: 'price' });
assert.deepEqual(buildItemPayload({ ...base, price: '-5' }, kz), { ok: false, error: 'price' });
assert.deepEqual(buildItemPayload({ ...base, price: '' }, kz), { ok: false, error: 'price' });
assert.deepEqual(buildItemPayload({ ...base, promo: '9000' }, kz), { ok: false, error: 'promo' });   // promoção ≥ preço
assert.deepEqual(buildItemPayload({ ...base, promo: '8500' }, kz), { ok: false, error: 'promo' });   // igual ao preço
assert.deepEqual(buildItemPayload({ ...base, promo: 'x' }, kz), { ok: false, error: 'promo' });
assert.deepEqual(buildItemPayload({ ...base, stock: '2.5' }, kz), { ok: false, error: 'stock' });
assert.deepEqual(buildItemPayload({ ...base, stock: '-1' }, kz), { ok: false, error: 'stock' });
r = buildItemPayload({ ...base, stock: '' }, kz); assert.ok(r.ok && r.payload.stock === null, 'stock vazio = sem controlo');
r = buildItemPayload({ ...base, promo: '7000,50' }, kz); assert.ok(r.ok && r.payload.promo_minor === 700050);
r = buildItemPayload(base, { ...kz, module: 'menu' }); assert.ok(r.ok && r.payload.stock === null, 'cardápio não tem stock');
// moedas sem casas decimais (as casas vêm do negócio, não do Intl)
r = buildItemPayload({ ...base, price: '1500' }, { currency: 'JPY', decimals: 0, module: 'catalog' }); assert.ok(r.ok && r.payload.price_minor === 1500);
r = buildItemPayload({ ...base, price: '1500' }, { currency: 'COP', decimals: 2, module: 'catalog' }); assert.ok(r.ok && r.payload.price_minor === 150000);
assert.equal(minorToInput(850000, 2), '8500.00'); assert.equal(minorToInput(1500, 0), '1500'); assert.equal(minorToInput(null, 2), '');
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://x.supabase.co';
assert.equal(imageUrl('a1b2/c3.jpg'), 'https://x.supabase.co/storage/v1/object/public/item-images/a1b2/c3.jpg');
console.log('✔ validação de itens (preço, promoção, stock, moedas sem decimais)');

// ---- a base de dados aceita o que o formulário gera (e quem pode escrever) ----
const db = await makeDb();
const owner = randomUUID(), staff = randomUUID(), stranger = randomUUID();
await db.query('insert into auth.users(id) values ($1),($2),($3)', [owner, staff, stranger]);
const tenant = (await asUser(db, owner, () => db.query<{ id: string }>(`select create_tenant('perola-charme','Perola&charme','beauty_store','AOA',2,'pt-PT','Africa/Luanda','AO','244923306869') id`))).rows[0].id;
await db.query(`insert into tenant_members(tenant_id,user_id,role) values ($1,$2,'staff')`, [tenant, staff]);
const cat = (await asUser(db, owner, () => db.query<{ id: string }>(`insert into categories(tenant_id,module,name) values ($1,'catalog','Cabelo') returning id`, [tenant]))).rows[0].id;

const cases: ItemForm[] = [
  { ...base, categoryId: cat }, { ...base, name: 'Máscara', price: '12000', promo: '9900', stock: '3', categoryId: cat },
  { ...base, name: 'Sem stock controlado', stock: '', categoryId: '' }, { ...base, name: 'Esgotado', stock: '0', categoryId: cat, active: false },
];
for (const c of cases) {
  const b = buildItemPayload(c, kz);
  if (!b.ok) throw new Error(`formulário válido rejeitado: ${b.error}`);
  const p = b.payload;
  await asUser(db, owner, () => db.query(
    `insert into items(tenant_id,module,category_id,name,description,price_minor,promo_minor,stock,emoji,active) values ($1,'catalog',$2,$3,$4,$5,$6,$7,$8,$9)`,
    [tenant, p.category_id, p.name, p.description, p.price_minor, p.promo_minor, p.stock, p.emoji, p.active]));
}
assert.equal((await db.query<{ n: number }>('select count(*)::int n from items where tenant_id=$1', [tenant])).rows[0].n, 4);
console.log('✔ a base de dados aceita todos os itens gerados pelo formulário');

// papéis: staff e estranhos não escrevem; o público só vê
const insertAs = (who: string | 'anon') => asUser(db, who, () => db.query(`insert into items(tenant_id,module,name,price_minor) values ($1,'catalog','Intruso',1)`, [tenant])).then(() => null, (e: Error) => e);
assert.ok(await insertAs(staff), 'staff não cria itens');
assert.ok(await insertAs(stranger), 'outro negócio não cria itens');
assert.ok(await insertAs('anon'), 'público não cria itens');
assert.equal((await asUser(db, 'anon', () => db.query('select id from items where tenant_id=$1', [tenant]))).rows.length, 4, 'público lê o catálogo');
// apagar categoria não apaga itens: ficam "sem categoria"
await asUser(db, owner, () => db.query('delete from categories where id=$1', [cat]));
const orphans = (await db.query<{ n: number }>('select count(*)::int n from items where tenant_id=$1 and category_id is null', [tenant])).rows[0].n;
assert.equal(orphans, 4, 'itens ficam sem categoria');
// a alteração feita pelo painel (update de um item) respeita as mesmas regras
await asUser(db, owner, () => db.query(`update items set active=false where tenant_id=$1 and name='Shampoo'`, [tenant]));
const upd = await asUser(db, owner, () => db.query(`update items set promo_minor=price_minor where tenant_id=$1 and name='Shampoo'`, [tenant])).then(() => null, (e: Error) => e);
assert.ok(upd, 'promoção igual ao preço é recusada também no update');
console.log('✔ papéis (staff/estranho/público), categoria apagada e regras de update');
process.exit(0);
