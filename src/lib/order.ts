import { toE164Digits } from './phone';
import { toMinor } from './money';

export type OrderModule = 'menu' | 'catalog';
export type Fulfillment = 'pickup' | 'delivery' | 'dine_in';
export type PayMethod = 'cash' | 'card' | 'online' | 'pix' | 'mbway' | 'transfer' | 'other';
export const PAY_METHODS: PayMethod[] = ['cash', 'card', 'online', 'pix', 'mbway', 'transfer', 'other'];
export const FULFILLMENTS: Fulfillment[] = ['pickup', 'delivery', 'dine_in'];

/* ---------- estados ---------- */
export const FLOW: Record<OrderModule, readonly string[]> = {
  menu: ['new', 'preparing', 'ready', 'completed'],
  catalog: ['new', 'confirmed', 'shipped', 'completed'],
};
export const ACTIVE_STATUSES = ['new', 'preparing', 'ready', 'confirmed', 'shipped'] as const;
export const isActive = (s: string): boolean => (ACTIVE_STATUSES as readonly string[]).includes(s);
export function nextStatus(mod: OrderModule, status: string): string | null {
  const f = FLOW[mod], i = f.indexOf(status);
  return i >= 0 && i < f.length - 1 ? f[i + 1] : null;
}
/** Coluna da fila onde o pedido aparece. */
export const columnOf = (status: string): 'new' | 'progress' | 'ready' | null =>
  status === 'new' ? 'new' : status === 'preparing' || status === 'confirmed' ? 'progress' : status === 'ready' || status === 'shipped' ? 'ready' : null;

/* ---------- configuração por módulo (igual a default_settings() da base de dados; há um teste que o garante) ---------- */
export interface OrderConfig { pickup: boolean; delivery: boolean; dine_in: boolean; fee_minor: number; min_minor: number; eta: string; payments: string[] }
export const DEFAULT_CONFIG: Record<OrderModule, OrderConfig> = {
  menu: { pickup: true, delivery: true, dine_in: true, fee_minor: 0, min_minor: 0, eta: '30-45 min', payments: ['cash', 'card'] },
  catalog: { pickup: true, delivery: true, dine_in: false, fee_minor: 0, min_minor: 0, eta: '1-2 dias', payments: ['card', 'transfer'] },
};
export function orderConfig(settings: Record<string, unknown> | null | undefined, mod: OrderModule): OrderConfig {
  const s = (settings?.[mod] ?? {}) as Partial<OrderConfig>;
  return { ...DEFAULT_CONFIG[mod], ...s, payments: Array.isArray(s.payments) ? s.payments : DEFAULT_CONFIG[mod].payments };
}
export const allowedFulfillments = (cfg: OrderConfig): Fulfillment[] => FULFILLMENTS.filter((f) => cfg[f]);

/* ---------- preços e totais (o servidor recalcula tudo; isto é só para mostrar) ---------- */
export interface PricedItem { price_minor: number; promo_minor: number | null }
export const unitPrice = (i: PricedItem): number => (i.promo_minor != null && i.promo_minor < i.price_minor ? i.promo_minor : i.price_minor);

export function totals(lines: { item: PricedItem; qty: number }[], cfg: OrderConfig, fulfillment: Fulfillment) {
  const subtotal = lines.reduce((a, l) => a + unitPrice(l.item) * l.qty, 0);
  const fee = fulfillment === 'delivery' ? cfg.fee_minor : 0;
  return { subtotal, fee, total: subtotal + fee, missing: Math.max(0, cfg.min_minor - subtotal) };
}

/* ---------- formulário de checkout -> parâmetros de place_order ---------- */
export interface OrderForm { fulfillment: Fulfillment; name: string; phone: string; address: string; table: string; payment: string; change: string; note: string }
export interface OrderCtx { slug: string; module: OrderModule; country: string; currency: string; decimals: number; lines: { itemId: string; qty: number }[] }
export type OrderFormError = 'name' | 'phone' | 'address' | 'table' | 'change';
export interface PlaceOrderParams {
  p_slug: string; p_module: OrderModule; p_items: { item_id: string; qty: number }[]; p_fulfillment: Fulfillment;
  p_customer_name: string; p_customer_phone: string; p_address: string | null; p_table: string | null;
  p_payment: string; p_cash_change_minor: number | null; p_note: string | null;
}

export function buildOrderParams(f: OrderForm, ctx: OrderCtx): { ok: true; params: PlaceOrderParams } | { ok: false; error: OrderFormError } {
  const name = f.name.trim();
  if (name.length < 2) return { ok: false, error: 'name' };
  const phone = toE164Digits(f.phone, ctx.country);
  if (!phone) return { ok: false, error: 'phone' };
  if (f.fulfillment === 'delivery' && f.address.trim().length < 5) return { ok: false, error: 'address' };
  if (f.fulfillment === 'dine_in' && f.table.trim().length < 1) return { ok: false, error: 'table' };
  let change: number | null = null;
  if (f.payment === 'cash' && f.change.trim() !== '') {
    change = toMinor(f.change, ctx.currency, ctx.decimals);
    if (change === null || change < 0) return { ok: false, error: 'change' };
  }
  return {
    ok: true,
    params: {
      p_slug: ctx.slug, p_module: ctx.module, p_items: ctx.lines.map((l) => ({ item_id: l.itemId, qty: l.qty })),
      p_fulfillment: f.fulfillment, p_customer_name: name, p_customer_phone: phone,
      p_address: f.fulfillment === 'delivery' ? f.address.trim() : null, p_table: f.fulfillment === 'dine_in' ? f.table.trim() : null,
      p_payment: f.payment, p_cash_change_minor: change, p_note: f.note.trim().slice(0, 300) || null,
    },
  };
}

/* ---------- mensagem de WhatsApp do pedido (cliente -> negócio) ---------- */
export interface OrderMessageInput {
  number: number; business: string; customer: string; phone: string; fulfillmentLabel: string; address?: string | null; table?: string | null;
  lines: { qty: number; name: string; total: string }[]; subtotal: string; fee?: string | null; total: string; paymentLabel: string; change?: string | null;
  note?: string | null; trackUrl?: string;
  labels: { order: string; customer: string; type: string; subtotal: string; delivery: string; total: string; payment: string; changeFor: string; note: string; track: string; table: string };
}
export function orderMessage(m: OrderMessageInput): string {
  const L = m.labels;
  const out = [`*${L.order} #${m.number}* — ${m.business}`, `${L.customer}: ${m.customer} (+${m.phone})`,
    `${L.type}: ${m.fulfillmentLabel}${m.address ? ` — ${m.address}` : ''}${m.table ? ` — ${L.table} ${m.table}` : ''}`, ''];
  m.lines.forEach((l) => out.push(`${l.qty}x ${l.name} — ${l.total}`));
  out.push('', `${L.subtotal}: ${m.subtotal}`);
  if (m.fee) out.push(`${L.delivery}: ${m.fee}`);
  out.push(`*${L.total}: ${m.total}*`, `${L.payment}: ${m.paymentLabel}${m.change ? ` (${L.changeFor} ${m.change})` : ''}`);
  if (m.note) out.push(`${L.note}: ${m.note}`);
  if (m.trackUrl) out.push('', `${L.track}: ${m.trackUrl}`);
  return out.join('\n');
}

/** Chave de tradução (orders.wa.*) da mensagem que o negócio envia ao cliente quando o estado muda. */
export function waStatusKey(status: string, fulfillment: string): string {
  if (status === 'ready') return fulfillment === 'delivery' ? 'ready_delivery' : fulfillment === 'dine_in' ? 'ready_dine_in' : 'ready_pickup';
  if (status === 'shipped') return fulfillment === 'delivery' ? 'shipped_delivery' : 'ready_pickup';
  return status;
}
