'use client';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { addLine, countItems, emptyCart, loadCart, qtyOf, resolveLines, saveCart, setQty, clearModule, type Cart } from '@/lib/cart';
import { formatMoney } from '@/lib/money';
import { unitPrice, type OrderConfig, type OrderModule } from '@/lib/order';
import { CheckoutDialog } from './CheckoutDialog';

export interface StoreItem { id: string; module: OrderModule; name: string; price_minor: number; promo_minor: number | null; stock: number | null; active: boolean; emoji: string | null }
export interface StoreInfo {
  slug: string; name: string; whatsapp: string | null; country: string; currency: string; decimals: number;
  moneyLocale: string; locale: string; configs: Record<OrderModule, OrderConfig>;
}
interface Ctx {
  cart: Cart; module: OrderModule | null; info: StoreInfo; items: Map<string, StoreItem>;
  add: (id: string) => void; set: (id: string, qty: number) => void; clear: () => void;
  money: (minor: number) => string; open: boolean; setOpen: (v: boolean) => void;
}
const CartCtx = createContext<Ctx | null>(null);
export const useCart = (): Ctx => {
  const c = useContext(CartCtx);
  if (!c) throw new Error('useCart fora do CartProvider');
  return c;
};

export function CartProvider({ info, items, module, children, initialCart, defaultOpen = false }: {
  info: StoreInfo; items: StoreItem[]; module: OrderModule | null; children: React.ReactNode;
  /** Só para testes/SSR: arranca com este carrinho e (opcionalmente) o checkout aberto. */
  initialCart?: Cart; defaultOpen?: boolean;
}) {
  const [cart, setCart] = useState<Cart>(initialCart ?? emptyCart);
  const [hydrated, setHydrated] = useState(false);
  const [open, setOpen] = useState(defaultOpen);
  const map = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  useEffect(() => { setCart(loadCart(info.slug)); setHydrated(true); }, [info.slug]);
  useEffect(() => { if (hydrated) saveCart(info.slug, cart); }, [cart, hydrated, info.slug]);

  const value: Ctx = {
    cart, module, info, items: map, open, setOpen,
    add: (id) => { const it = map.get(id); if (it) setCart((c) => addLine(c, it.module, id, it.stock)); },
    set: (id, qty) => { const it = map.get(id); if (it) setCart((c) => setQty(c, it.module, id, qty, it.stock)); },
    clear: () => { if (module) setCart((c) => clearModule(c, module)); },
    money: (n) => formatMoney(n, info.currency, info.moneyLocale, info.decimals),
  };
  return (
    <CartCtx.Provider value={value}>
      {children}
      <CartBar />
      {open && module && <CheckoutDialog />}
    </CartCtx.Provider>
  );
}

/** Botão "+" da lista; passa a contador − n + quando o item já está na sacola. */
export function AddButton({ itemId }: { itemId: string }) {
  const t = useTranslations('order');
  const { cart, add, set, items } = useCart();
  const item = items.get(itemId);
  if (!item || !item.active || item.stock === 0) return null;
  const qty = qtyOf(cart, item.module, itemId);
  if (qty === 0) return <button className="addbtn" aria-label={t('addAria', { name: item.name })} onClick={() => add(itemId)}>+</button>;
  return (
    <span className="stepper">
      <button aria-label={t('decAria')} onClick={() => set(itemId, qty - 1)}>−</button><b>{qty}</b>
      <button aria-label={t('incAria')} onClick={() => add(itemId)} disabled={item.stock != null && qty >= item.stock}>+</button>
    </span>
  );
}

function CartBar() {
  const t = useTranslations('order');
  const { cart, module, items, money, setOpen, open } = useCart();
  if (!module || open) return null;
  const n = countItems(cart, module);
  if (n === 0) return null;
  const lines = resolveLines(cart, module, items);
  const sub = lines.reduce((a, l) => a + unitPrice(l.item) * l.qty, 0);
  return (
    <button className="cartbar" onClick={() => setOpen(true)}>
      <span><i className="q">{n}</i>{t('viewBag')}</span><b>{money(sub)}</b>
    </button>
  );
}
