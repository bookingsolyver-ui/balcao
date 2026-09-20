import { toMinor } from './money';

export const EMOJIS: Record<'menu' | 'catalog', string[]> = {
  menu: ['☕', '🥛', '🍵', '🧊', '🍋', '🍊', '🥤', '🍺', '🍷', '🧃', '🥐', '🍞', '🥪', '🍔', '🍟', '🌭', '🍕', '🌮', '🥗', '🍝', '🍜', '🍣', '🍰', '🧁', '🍪', '🍫', '🍩', '🍦', '🧀', '🥩', '🍗', '🍳'],
  catalog: ['🧴', '💆', '🌿', '💄', '💅', '🪮', '✂️', '🧼', '🧖', '🕯️', '🎁', '👜', '👕', '👟', '💍', '⌚', '🕶️', '📦', '🧸', '📚', '🎧', '🔌', '🪴', '🍯', '🥫', '🧺', '🖼️', '🛠️', '☕', '🫖', '⚙️', '🚲'],
};

export interface ItemForm {
  name: string; description: string; price: string; promo: string; stock: string;
  emoji: string; categoryId: string; active: boolean;
}
export interface ItemCtx { currency: string; decimals: number; module: 'menu' | 'catalog' }
export interface ItemPayload {
  name: string; description: string; price_minor: number; promo_minor: number | null; stock: number | null;
  emoji: string | null; category_id: string | null; active: boolean;
}
export type ItemErrorKey = 'name' | 'price' | 'promo' | 'stock';

const MAX_MINOR = 1_000_000_000_000; // limite de sanidade (1 bilião de unidades mínimas)

/**
 * Valida o formulário e devolve o que vai para a base de dados.
 * Regras iguais às restrições da tabela items (preço ≥ 0, promoção < preço, stock ≥ 0 ou nulo).
 * As casas decimais vêm SEMPRE do negócio (currency_decimals).
 */
export function buildItemPayload(f: ItemForm, ctx: ItemCtx): { ok: true; payload: ItemPayload } | { ok: false; error: ItemErrorKey } {
  const name = f.name.trim();
  if (name.length < 1 || name.length > 120) return { ok: false, error: 'name' };

  const price = toMinor(f.price, ctx.currency, ctx.decimals);
  if (price === null || price < 0 || price > MAX_MINOR) return { ok: false, error: 'price' };

  let promo: number | null = null;
  if (f.promo.trim() !== '') {
    promo = toMinor(f.promo, ctx.currency, ctx.decimals);
    if (promo === null || promo < 0 || promo >= price) return { ok: false, error: 'promo' };
  }

  let stock: number | null = null;
  if (ctx.module === 'catalog' && f.stock.trim() !== '') {
    if (!/^\d{1,9}$/.test(f.stock.trim())) return { ok: false, error: 'stock' };
    stock = Number(f.stock.trim());
  }

  return {
    ok: true,
    payload: {
      name, description: f.description.trim().slice(0, 500), price_minor: price, promo_minor: promo, stock,
      emoji: f.emoji || null, category_id: f.categoryId || null, active: f.active,
    },
  };
}

/** Preço em texto editável (usa as casas decimais do negócio). */
export const minorToInput = (minor: number | null, decimals: number): string =>
  minor == null ? '' : (minor / 10 ** decimals).toFixed(decimals);
