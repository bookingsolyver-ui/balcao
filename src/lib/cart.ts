import { unitPrice, type OrderModule, type PricedItem } from './order';

export interface CartLine { itemId: string; qty: number }
export type Cart = Record<OrderModule, CartLine[]>
export const emptyCart = (): Cart => ({ menu: [], catalog: [] });

const MAX_QTY = 99;
const clamp = (qty: number, max?: number | null) => Math.max(0, Math.min(qty, MAX_QTY, max ?? MAX_QTY));

/** Todas as funções devolvem um carrinho novo (sem mexer no anterior). `max` = stock disponível (null = sem limite). */
export function addLine(cart: Cart, mod: OrderModule, itemId: string, max?: number | null): Cart {
  const cur = cart[mod].find((l) => l.itemId === itemId)?.qty ?? 0;
  return setQty(cart, mod, itemId, cur + 1, max);
}
export function setQty(cart: Cart, mod: OrderModule, itemId: string, qty: number, max?: number | null): Cart {
  const q = Number.isFinite(qty) ? clamp(Math.floor(qty), max) : 0;
  const lines = q > 0 ? upsert(cart[mod], itemId, q) : cart[mod].filter((l) => l.itemId !== itemId);
  return { ...cart, [mod]: lines };
}
function upsert(lines: CartLine[], itemId: string, qty: number): CartLine[] {
  return lines.some((l) => l.itemId === itemId) ? lines.map((l) => (l.itemId === itemId ? { ...l, qty } : l)) : [...lines, { itemId, qty }];
}
export const clearModule = (cart: Cart, mod: OrderModule): Cart => ({ ...cart, [mod]: [] });
export const countItems = (cart: Cart, mod: OrderModule): number => cart[mod].reduce((a, l) => a + l.qty, 0);
export const qtyOf = (cart: Cart, mod: OrderModule, itemId: string): number => cart[mod].find((l) => l.itemId === itemId)?.qty ?? 0;

/** Junta as linhas do carrinho com os itens atuais; ignora itens que já não existem ou ficaram indisponíveis. */
export function resolveLines<T extends PricedItem & { id: string; active: boolean; stock: number | null }>(
  cart: Cart, mod: OrderModule, items: Map<string, T>,
): { item: T; qty: number }[] {
  return cart[mod].flatMap((l) => {
    const item = items.get(l.itemId);
    if (!item || !item.active || item.stock === 0) return [];
    return [{ item, qty: clamp(l.qty, item.stock) }].filter((x) => x.qty > 0);
  });
}
export const lineTotal = (item: PricedItem, qty: number): number => unitPrice(item) * qty;

/* ---- persistência (só browser; falha em silêncio) ---- */
const key = (slug: string) => `balcao:cart:${slug}`;
export function loadCart(slug: string): Cart {
  try {
    const raw = JSON.parse(localStorage.getItem(key(slug)) ?? 'null') as Cart | null;
    const ok = (a: unknown): a is CartLine[] => Array.isArray(a) && a.every((l) => l && typeof l.itemId === 'string' && Number.isInteger(l.qty) && l.qty > 0 && l.qty <= MAX_QTY);
    return raw && ok(raw.menu) && ok(raw.catalog) ? { menu: raw.menu, catalog: raw.catalog } : emptyCart();
  } catch { return emptyCart(); }
}
export function saveCart(slug: string, cart: Cart): void {
  try { localStorage.setItem(key(slug), JSON.stringify(cart)); } catch { /* sem armazenamento: continua em memória */ }
}
