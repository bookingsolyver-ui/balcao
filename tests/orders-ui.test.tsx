// Desenha os ecrãs de pedidos (carrinho, checkout, acompanhamento e fila do negócio) e confirma o que se vê.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderToString } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import { AddButton, CartProvider, type StoreInfo, type StoreItem } from '../src/components/store/CartProvider';
import { OrderTracker } from '../src/components/store/OrderTracker';
import { OrdersBoard, type BoardOrder } from '../src/components/OrdersBoard';
import { DEFAULT_CONFIG } from '../src/lib/order';
import type { TrackData } from '../src/lib/types';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://x.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'sb_publishable_teste';
const messages = (l: string) => JSON.parse(readFileSync(new URL(`../messages/${l}.json`, import.meta.url), 'utf8'));
const wrap = (l: string, node: React.ReactNode) => renderToString(<NextIntlClientProvider locale={l} messages={messages(l)} timeZone="UTC">{node}</NextIntlClientProvider>).replace(/<!-- -->/g, '');
const text = (h: string) => h.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');

const items: StoreItem[] = [
  { id: 'a', module: 'menu', name: 'Cappuccino', price_minor: 280000, promo_minor: null, stock: 5, active: true, emoji: '☕' },
  { id: 'b', module: 'menu', name: 'Bolo', price_minor: 400000, promo_minor: 300000, stock: null, active: true, emoji: '🍰' },
  { id: 'c', module: 'menu', name: 'Esgotado', price_minor: 100, promo_minor: null, stock: 0, active: true, emoji: '❌' },
];
const info = (over: Partial<StoreInfo> = {}): StoreInfo => ({
  slug: 'cafe', name: 'Café Aurora', whatsapp: '351912345678', country: 'AO', currency: 'AOA', decimals: 2, moneyLocale: 'pt-AO', locale: 'pt-PT',
  configs: { menu: { ...DEFAULT_CONFIG.menu, fee_minor: 30000, min_minor: 500000 }, catalog: DEFAULT_CONFIG.catalog }, ...over,
});

// ---- botão de adicionar ----
let h = wrap('pt-PT', <CartProvider info={info()} items={items} module="menu"><AddButton itemId="a" /><AddButton itemId="c" /></CartProvider>);
assert.match(h, /aria-label="Adicionar Cappuccino"/); assert.doesNotMatch(h, /Esgotado/, 'item esgotado não tem botão');
h = wrap('pt-PT', <CartProvider info={info()} items={items} module="menu" initialCart={{ menu: [{ itemId: 'a', qty: 2 }], catalog: [] }}><AddButton itemId="a" /></CartProvider>);
assert.match(h, /<b>2<\/b>/, 'com item na sacola mostra − 2 +'); assert.match(h, /aria-label="Menos"/);
console.log('✔ botão de adicionar e contador');

// ---- barra da sacola: 2 × 2 800,00 + 1 × 3 000,00 (promoção) = 8 600,00 ----
const cart = { menu: [{ itemId: 'a', qty: 2 }, { itemId: 'b', qty: 1 }], catalog: [] };
h = wrap('pt-PT', <CartProvider info={info()} items={items} module="menu" initialCart={cart}><p>loja</p></CartProvider>);
assert.match(text(h), /3\s*Ver sacola\s*8\s600,00\s?Kz/);
h = wrap('pt-PT', <CartProvider info={info()} items={items} module="menu"><p>loja</p></CartProvider>);
assert.doesNotMatch(h, /Ver sacola/, 'sem itens não há barra');
console.log('✔ barra da sacola com quantidade e subtotal');

// ---- checkout aberto ----
h = wrap('pt-PT', <CartProvider info={info()} items={items} module="menu" initialCart={cart} defaultOpen><p>loja</p></CartProvider>);
let tx = text(h);
assert.match(tx, /Sacola/); assert.match(tx, /Cappuccino/); assert.match(tx, /Bolo/);
assert.match(tx, /Levantar no local/); assert.match(tx, /Entrega/); assert.match(tx, /Na mesa/);
assert.match(tx, /Previsão: 30-45 min/);
assert.match(tx, /Dinheiro/); assert.match(tx, /Cartão/); assert.doesNotMatch(tx, /Pix/, 'só os pagamentos ativos do negócio');
assert.match(tx, /Troco para quanto/, 'dinheiro por defeito pede troco');
assert.match(tx, /Subtotal\s*8\s600,00\s?Kz/); assert.doesNotMatch(tx, /Taxa|Entrega\s*300,00/, 'sem taxa quando é levantar');
assert.match(tx, /Fazer pedido · 8\s600,00\s?Kz/);
assert.doesNotMatch(tx, /Pedido mínimo/, '8 600 ≥ mínimo de 5 000');
console.log('✔ checkout: formas de receber, pagamentos do negócio, totais');

// mínimo do pedido
h = wrap('pt-PT', <CartProvider info={info()} items={items} module="menu" initialCart={{ menu: [{ itemId: 'a', qty: 1 }], catalog: [] }} defaultOpen><p>loja</p></CartProvider>);
assert.match(text(h), /Pedido mínimo de 5\s000,00\s?Kz\. Faltam 2\s200,00\s?Kz/);
console.log('✔ aviso de pedido mínimo');

// só entrega e cartão (loja de beleza): sem "na mesa"
const shop: StoreInfo = info({ moneyLocale: 'en', configs: { menu: DEFAULT_CONFIG.menu, catalog: { ...DEFAULT_CONFIG.catalog, dine_in: false, pickup: false, fee_minor: 30000, payments: ['transfer', 'online'] } } });
h = wrap('en', <CartProvider info={shop} items={items.map((i) => ({ ...i, module: 'catalog' as const }))} module="catalog" initialCart={{ menu: [], catalog: [{ itemId: 'a', qty: 1 }] }} defaultOpen><p>store</p></CartProvider>);
tx = text(h);
assert.match(tx, /Delivery/); assert.doesNotMatch(tx, /Pickup|At the table/); assert.match(tx, /Bank transfer/); assert.match(tx, /Online/); assert.doesNotMatch(tx, /Change for how much/, 'sem dinheiro não pede troco');
assert.match(tx, /Delivery\s*AOA\s*300\.00/, 'taxa de entrega em inglês'); assert.match(tx, /Total\s*AOA\s*3,100\.00/, 'subtotal 2 800 + entrega 300');
console.log('✔ checkout respeita a configuração do negócio (só entrega, transferência/online)');

// ---- acompanhamento ----
const track: TrackData = { number: 1001, module: 'catalog', status: 'shipped', fulfillment: 'delivery', payment_method: 'transfer', subtotal_minor: 860000, fee_minor: 30000, total_minor: 890000, currency: 'AOA', created_at: '2026-09-20T10:00:00Z', updated_at: '2026-09-20T10:30:00Z', tenant_slug: 'x', items: [{ name: 'Máscara', qty: 2, unit_minor: 430000 }] };
h = wrap('pt-PT', <OrderTracker token="t" initial={track} moneyLocale="pt-AO" decimals={2} />);
tx = text(h);
assert.match(tx, /Pedido #1001/); assert.match(tx, /Enviado · Atualiza sozinho/);
assert.match(tx, /Recebido/, 'catálogo mostra passos do catálogo'); assert.match(tx, /Confirmado/); assert.match(tx, /Concluído/); assert.doesNotMatch(tx, /Em preparação/);
assert.match(h, /aria-current="step"/); assert.match(tx, /2× Máscara\s*8\s600,00\s?Kz/); assert.match(tx, /Total\s*8\s900,00\s?Kz/);
h = wrap('es', <OrderTracker token="t" initial={{ ...track, module: 'menu', status: 'preparing' }} moneyLocale="es" decimals={2} />);
assert.match(text(h), /En preparación/);
h = wrap('en', <OrderTracker token="t" initial={{ ...track, status: 'cancelled' }} moneyLocale="en" decimals={2} />);
assert.match(text(h), /This order was cancelled/); assert.doesNotMatch(h, /class="steps"/);
h = wrap('pt-PT', <OrderTracker token="t" initial={{ ...track, status: 'completed' }} moneyLocale="pt-AO" decimals={2} />);
assert.doesNotMatch(text(h), /Atualiza sozinho/, 'pedido concluído não atualiza');
console.log('✔ acompanhamento: passos por módulo, cancelado e concluído');

// ---- fila do negócio ----
const o = (n: number, module: 'menu' | 'catalog', status: string, extra: Partial<BoardOrder> = {}): BoardOrder => ({
  id: `o${n}`, number: n, module, status, fulfillment: 'delivery', customer_name: 'Ana Silva', customer_phone: '351912345678', address: 'Rua A, 1', table_label: null,
  payment_method: 'cash', cash_change_minor: 5000, note: 'sem cebola', subtotal_minor: 860000, fee_minor: 30000, total_minor: 890000, currency: 'AOA', created_at: '2026-09-20T10:00:00Z',
  items: [{ id: `i${n}`, order_id: `o${n}`, name: 'Cappuccino', unit_minor: 280000, qty: 2, note: null }], ...extra,
});
const board = [o(1001, 'menu', 'new'), o(1002, 'menu', 'preparing'), o(1003, 'catalog', 'confirmed', { fulfillment: 'pickup', payment_method: 'transfer', cash_change_minor: null }), o(1004, 'menu', 'ready', { fulfillment: 'dine_in', table_label: '4', address: null }), o(1005, 'catalog', 'shipped'), o(1006, 'menu', 'completed'), o(1007, 'menu', 'cancelled')];
const tenant = { id: 't1', name: 'Café Aurora', currency: 'AOA', decimals: 2, moneyLocale: 'pt-AO', timezone: 'Africa/Luanda' };
h = wrap('pt-PT', <OrdersBoard tenant={tenant} initialOrders={board} />);
tx = text(h);
assert.match(tx, /Fila \(1\)/, 'contador de pedidos novos'); assert.match(tx, /Novos\s*1/); assert.match(tx, /Em curso\s*2/); assert.match(tx, /Prontos\s*2/);
assert.match(tx, /#1001/); assert.doesNotMatch(tx, /#1006|#1007/, 'concluídos e cancelados só no histórico');
assert.match(tx, /Aceitar pedido/); assert.match(tx, /Marcar como pronto/); assert.match(tx, /Marcar como enviado/); assert.match(tx, /Concluir/);
assert.match(tx, /Mesa 4/); assert.match(tx, /Troco para 50,00\s?Kz/); assert.match(tx, /8\s900,00\s?Kz/); assert.match(tx, /Entrega 300,00\s?Kz/);
assert.match(tx, /Cardápio/); assert.match(tx, /Catálogo/); assert.match(tx, /sem cebola/); assert.match(tx, /\+351912345678/);
// ligação de WhatsApp para o cliente, com a mensagem certa para cada estado
const links = [...h.matchAll(/href="(https:\/\/wa\.me\/[^"]+)"/g)].map((m) => decodeURIComponent(m[1].replace(/&amp;/g, '&')));
assert.ok(links.every((l) => l.startsWith('https://wa.me/351912345678?text=')));
assert.ok(links.some((l) => /pedido #1001\. Vamos confirmar já/.test(l)), 'novo: recebemos'); assert.ok(links.some((l) => /#1002 foi aceite/.test(l)), 'em preparação');
assert.ok(links.some((l) => /#1003 foi confirmado/.test(l)), 'catálogo confirmado'); assert.ok(links.some((l) => /#1004 está pronto para servir/.test(l)), 'na mesa');
assert.ok(links.some((l) => /#1005 foi enviado/.test(l)), 'enviado'); assert.equal(links.length, 5);
console.log('✔ fila: colunas, ações por estado, contador e mensagens de WhatsApp');
h = wrap('en', <OrdersBoard tenant={{ ...tenant, moneyLocale: 'en' }} initialOrders={[]} />);
assert.match(text(h), /No orders in the queue/);
h = wrap('es', <OrdersBoard tenant={tenant} initialOrders={board.slice(0, 1)} />);
assert.match(text(h), /Aceptar pedido/); assert.match(text(h), /Nuevos\s*1/);
h = wrap('pt-BR', <OrdersBoard tenant={tenant} initialOrders={board.slice(0, 1)} />);
assert.match(text(h), /Aceitar pedido|Aceitar/i, 'pt-BR');
console.log('✔ fila vazia e idiomas en / es / pt-BR');
process.exit(0);
