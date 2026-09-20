// Lógica de pedidos: tem de bater certo com a base de dados (totais, configuração, estados, erros).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { addLine, clearModule, countItems, emptyCart, qtyOf, resolveLines, setQty } from '../src/lib/cart';
import { DEFAULT_CONFIG, FLOW, buildOrderParams, columnOf, nextStatus, orderConfig, orderMessage, totals, unitPrice, waStatusKey, type OrderForm } from '../src/lib/order';
import { dbErrorKey } from '../src/lib/errors';
import { makeDb, asUser } from './helpers/pg';

// ---- carrinho ----
let c = emptyCart();
c = addLine(c, 'menu', 'a'); c = addLine(c, 'menu', 'a'); c = addLine(c, 'menu', 'b');
assert.equal(qtyOf(c, 'menu', 'a'), 2); assert.equal(countItems(c, 'menu'), 3); assert.equal(countItems(c, 'catalog'), 0);
c = setQty(c, 'menu', 'a', 5, 3); assert.equal(qtyOf(c, 'menu', 'a'), 3, 'limitado ao stock');
c = setQty(c, 'menu', 'a', 0); assert.equal(qtyOf(c, 'menu', 'a'), 0); assert.equal(c.menu.length, 1, 'qty 0 remove a linha');
assert.equal(qtyOf(setQty(emptyCart(), 'catalog', 'z', 500), 'catalog', 'z'), 99, 'máximo 99');
assert.equal(qtyOf(setQty(emptyCart(), 'catalog', 'z', NaN), 'catalog', 'z'), 0);
const before = emptyCart(); addLine(before, 'menu', 'q'); assert.equal(before.menu.length, 0, 'não altera o carrinho anterior');
assert.deepEqual(clearModule(c, 'menu').menu, []);
const items = new Map([['a', { id: 'a', price_minor: 1000, promo_minor: 800, stock: 2, active: true }], ['b', { id: 'b', price_minor: 500, promo_minor: null, stock: null, active: true }], ['x', { id: 'x', price_minor: 1, promo_minor: null, stock: 0, active: true }], ['y', { id: 'y', price_minor: 1, promo_minor: null, stock: null, active: false }]]);
const rc = resolveLines({ menu: [{ itemId: 'a', qty: 9 }, { itemId: 'b', qty: 1 }, { itemId: 'x', qty: 1 }, { itemId: 'y', qty: 1 }, { itemId: 'gone', qty: 1 }], catalog: [] }, 'menu', items);
assert.deepEqual(rc.map((l) => [l.item.id, l.qty]), [['a', 2], ['b', 1]], 'ignora esgotados/inativos/removidos e limita ao stock');
assert.equal(unitPrice(items.get('a')!), 800); assert.equal(unitPrice({ price_minor: 100, promo_minor: 100 }), 100);

// ---- estados ----
assert.equal(nextStatus('menu', 'new'), 'preparing'); assert.equal(nextStatus('menu', 'ready'), 'completed'); assert.equal(nextStatus('menu', 'completed'), null);
assert.equal(nextStatus('catalog', 'new'), 'confirmed'); assert.equal(nextStatus('catalog', 'confirmed'), 'shipped'); assert.equal(nextStatus('catalog', 'cancelled'), null);
assert.equal(columnOf('preparing'), 'progress'); assert.equal(columnOf('shipped'), 'ready'); assert.equal(columnOf('completed'), null);
assert.equal(waStatusKey('ready', 'delivery'), 'ready_delivery'); assert.equal(waStatusKey('shipped', 'pickup'), 'ready_pickup'); assert.equal(waStatusKey('new', 'pickup'), 'new');

// ---- checkout ----
const form: OrderForm = { fulfillment: 'delivery', name: ' Ana Silva ', phone: '912 345 678', address: 'Rua A, 1', table: '', payment: 'cash', change: '50', note: ' sem cebola ' };
const ctx = { slug: 'cafe', module: 'menu' as const, country: 'PT', currency: 'EUR', decimals: 2, lines: [{ itemId: 'i1', qty: 2 }] };
let b = buildOrderParams(form, ctx); assert.ok(b.ok);
if (b.ok) { assert.equal(b.params.p_customer_phone, '351912345678'); assert.equal(b.params.p_cash_change_minor, 5000); assert.equal(b.params.p_note, 'sem cebola'); assert.equal(b.params.p_table, null); assert.deepEqual(b.params.p_items, [{ item_id: 'i1', qty: 2 }]); }
for (const [patch, err] of [[{ name: 'A' }, 'name'], [{ phone: '12' }, 'phone'], [{ address: 'x' }, 'address'], [{ fulfillment: 'dine_in' as const, table: ' ' }, 'table'], [{ change: 'abc' }, 'change']] as const)
  assert.deepEqual(buildOrderParams({ ...form, ...patch }, ctx), { ok: false, error: err });
b = buildOrderParams({ ...form, fulfillment: 'pickup', payment: 'card', change: 'abc' }, ctx); assert.ok(b.ok && b.params.p_address === null && b.params.p_cash_change_minor === null, 'troco só conta em dinheiro');
assert.equal(orderConfig({}, 'menu').eta, '30-45 min'); assert.deepEqual(orderConfig({ menu: { fee_minor: 300, payments: ['cash'] } }, 'menu').payments, ['cash']);
const t1 = totals([{ item: { price_minor: 1000, promo_minor: 800 }, qty: 2 }], { ...DEFAULT_CONFIG.menu, fee_minor: 300, min_minor: 2000 }, 'delivery');
assert.deepEqual(t1, { subtotal: 1600, fee: 300, total: 1900, missing: 400 });
const msg = orderMessage({ number: 1001, business: 'Café', customer: 'Ana', phone: '351912345678', fulfillmentLabel: 'Entrega', address: 'Rua A', lines: [{ qty: 2, name: 'Cappuccino', total: '5,60 €' }], subtotal: '5,60 €', fee: '2,00 €', total: '7,60 €', paymentLabel: 'Dinheiro', change: '10,00 €', note: 'sem açúcar', trackUrl: 'https://x/t',
  labels: { order: 'Pedido', customer: 'Cliente', type: 'Tipo', subtotal: 'Subtotal', delivery: 'Entrega', total: 'Total', payment: 'Pagamento', changeFor: 'troco para', note: 'Obs.', track: 'Acompanhar', table: 'Mesa' } });
assert.match(msg, /^\*Pedido #1001\* — Café/); assert.match(msg, /2x Cappuccino — 5,60 €/); assert.match(msg, /\*Total: 7,60 €\*/); assert.match(msg, /troco para 10,00 €/); assert.match(msg, /Acompanhar: https:\/\/x\/t$/);
console.log('✔ carrinho, estados, checkout e mensagem de WhatsApp');

// ---- contra o Postgres real ----
const db = await makeDb();
const cfgDb = (await db.query<{ s: Record<string, unknown> }>('select default_settings() s')).rows[0].s;
assert.deepEqual({ menu: cfgDb.menu, catalog: cfgDb.catalog }, { menu: DEFAULT_CONFIG.menu, catalog: { ...DEFAULT_CONFIG.catalog, low_stock: 3 } }, 'DEFAULT_CONFIG igual a default_settings()');
console.log('✔ configuração por defeito igual à da base de dados');

const owner = randomUUID(); await db.query('insert into auth.users(id) values ($1)', [owner]);
const tenant = (await asUser(db, owner, () => db.query<{ id: string }>(`select create_tenant('cafe','Café','restaurant','EUR',2,'pt-PT','Europe/Lisbon','PT','351911111111') id`))).rows[0].id;
await db.query(`update tenants set settings = jsonb_set(jsonb_set(settings,'{menu,fee_minor}','300'),'{menu,min_minor}','800') where id=$1`, [tenant]);
const cat = (await db.query<{ id: string }>(`insert into categories(tenant_id,module,name) values ($1,'menu','Cafés') returning id`, [tenant])).rows[0].id;
const ins = async (name: string, price: number, promo: number | null, stock: number | null) => (await db.query<{ id: string }>(`insert into items(tenant_id,module,category_id,name,price_minor,promo_minor,stock) values ($1,'menu',$2,$3,$4,$5,$6) returning id`, [tenant, cat, name, price, promo, stock])).rows[0].id;
const capp = await ins('Cappuccino', 280, null, 5), bolo = await ins('Bolo', 400, 300, null);
const settings = (await db.query<{ settings: Record<string, unknown> }>('select settings from tenants where id=$1', [tenant])).rows[0].settings;
const cfg = orderConfig(settings, 'menu');
assert.equal(cfg.fee_minor, 300); assert.equal(cfg.min_minor, 800);

const place = async (f: OrderForm, lines: { itemId: string; qty: number }[]) => {
  const r = buildOrderParams(f, { slug: 'cafe', module: 'menu', country: 'PT', currency: 'EUR', decimals: 2, lines });
  if (!r.ok) throw new Error('form ' + r.error);
  const p = r.params;
  return asUser(db, 'anon', () => db.query<{ r: { number: number; total_minor: number; public_token: string; order_id: string } }>(
    'select place_order($1,$2,$3::jsonb,$4,$5,$6,$7,$8,$9,$10,$11) r', [p.p_slug, p.p_module, JSON.stringify(p.p_items), p.p_fulfillment, p.p_customer_name, p.p_customer_phone, p.p_address, p.p_table, p.p_payment, p.p_cash_change_minor, p.p_note]));
};
const base: OrderForm = { fulfillment: 'delivery', name: 'Ana Silva', phone: '912345678', address: 'Rua A, 1', table: '', payment: 'cash', change: '', note: '' };
const lines = [{ itemId: capp, qty: 2 }, { itemId: bolo, qty: 1 }];
// o total mostrado no ecrã tem de ser IGUAL ao calculado pelo servidor
const shown = totals(lines.map((l) => ({ item: l.itemId === capp ? { price_minor: 280, promo_minor: null } : { price_minor: 400, promo_minor: 300 }, qty: l.qty })), cfg, 'delivery');
const ok = (await place(base, lines)).rows[0].r;
assert.equal(ok.total_minor, shown.total, `total do servidor (${ok.total_minor}) = total mostrado (${shown.total})`);
assert.equal(shown.total, 280 * 2 + 300 + 300);
console.log('✔ o total mostrado ao cliente é igual ao calculado pelo servidor (com taxa e promoção)');

const errKey = (e: unknown) => dbErrorKey(e as { code?: string; message?: string });
const fails = async (f: OrderForm, l = lines) => { try { await place(f, l); return null; } catch (e) { return errKey(e); } };
assert.equal(await fails({ ...base, fulfillment: 'pickup' }, [{ itemId: bolo, qty: 1 }]), 'below_minimum');           // 300 < mínimo 800
assert.equal(await fails({ ...base, phone: '912345678' }, [{ itemId: capp, qty: 9 }]), 'insufficient_stock');
assert.equal(await fails({ ...base, payment: 'pix' }), 'payment_not_allowed');
assert.equal((await db.query<{ stock: number }>('select stock from items where id=$1', [capp])).rows[0].stock, 3, 'pedidos recusados não mexem no stock');
console.log('✔ erros do servidor mapeados para chaves de tradução');

// ---- fluxo de estados completo, conduzido pelas mesmas funções que a interface usa ----
const tok = ok.public_token;
let st = 'new'; const seen: string[] = [st];
for (let n = nextStatus('menu', st); n; n = nextStatus('menu', st)) {
  await asUser(db, owner, () => db.query('update orders set status=$1 where id=$2', [n, ok.order_id]));
  st = n; seen.push(n);
}
assert.deepEqual(seen, [...FLOW.menu]);
const tr = (await asUser(db, 'anon', () => db.query<{ s: { status: string; module: string; tenant_slug: string; items: unknown[]; total_minor: number } }>('select get_order_status($1) s', [tok]))).rows[0].s;
assert.equal(tr.status, 'completed'); assert.equal(tr.module, 'menu'); assert.equal(tr.tenant_slug, 'cafe'); assert.equal(tr.items.length, 2); assert.equal(tr.total_minor, shown.total);
assert.equal((await db.query<{ n: number }>(`select balance n from loyalty_customers where phone='351912345678'`)).rows[0].n, 1, 'concluir pelo fluxo carimba a fidelidade');
console.log('✔ fluxo new → preparing → ready → completed + acompanhamento com módulo e slug');

// cancelar devolve o stock e não reabre
const o2 = (await place({ ...base, fulfillment: 'delivery', address: 'Rua B, 2' }, [{ itemId: capp, qty: 3 }, { itemId: bolo, qty: 1 }])).rows[0].r;
assert.equal((await db.query<{ stock: number }>('select stock from items where id=$1', [capp])).rows[0].stock, 0);
await asUser(db, owner, () => db.query(`update orders set status='cancelled' where id=$1`, [o2.order_id]));
assert.equal((await db.query<{ stock: number }>('select stock from items where id=$1', [capp])).rows[0].stock, 3, 'cancelar devolve o stock');
console.log('✔ cancelar devolve o stock');
process.exit(0);
