import { toMinor } from './money';
import { minorToInput } from './items';
import { COUNTRIES } from './countries';
import { toE164Digits } from './phone';
import { FULFILLMENTS, PAY_METHODS, type Fulfillment, type OrderConfig, type OrderModule } from './order';
import { paymentsFor } from './payments';

/* ---------- pedidos (por módulo) ---------- */
export interface OrderSettingsForm { pickup: boolean; delivery: boolean; dine_in: boolean; fee: string; min: string; eta: string; payments: string[] }
export type OrderSettingsError = 'fee' | 'min' | 'eta' | 'no_fulfillment' | 'no_payment' | 'no_payment_for_delivery';
export type OrderSettingsValue = Pick<OrderConfig, 'pickup' | 'delivery' | 'dine_in' | 'fee_minor' | 'min_minor' | 'eta' | 'payments'>;

export function toOrderSettingsForm(cfg: OrderConfig, decimals: number): OrderSettingsForm {
  return { pickup: cfg.pickup, delivery: cfg.delivery, dine_in: cfg.dine_in, fee: minorToInput(cfg.fee_minor, decimals), min: minorToInput(cfg.min_minor, decimals), eta: cfg.eta, payments: [...cfg.payments] };
}

export function buildOrderSettings(f: OrderSettingsForm, ctx: { currency: string; decimals: number; module: OrderModule }): { ok: true; value: OrderSettingsValue } | { ok: false; error: OrderSettingsError } {
  const dine_in = ctx.module === 'menu' ? f.dine_in : false; // o catálogo não tem "na mesa"
  if (!f.pickup && !f.delivery && !dine_in) return { ok: false, error: 'no_fulfillment' };

  const money = (s: string): number | null => (s.trim() === '' ? 0 : toMinor(s, ctx.currency, ctx.decimals));
  const fee = money(f.fee), min = money(f.min);
  if (fee === null || fee < 0) return { ok: false, error: 'fee' };
  if (min === null || min < 0) return { ok: false, error: 'min' };
  const eta = f.eta.trim();
  if (eta.length < 1 || eta.length > 60) return { ok: false, error: 'eta' };

  const payments = PAY_METHODS.filter((p) => f.payments.includes(p)); // valida, remove duplicados e ordena
  if (payments.length === 0) return { ok: false, error: 'no_payment' };
  const value: OrderSettingsValue = { pickup: f.pickup, delivery: f.delivery, dine_in, fee_minor: fee, min_minor: min, eta, payments };
  for (const fl of FULFILLMENTS) {
    if (value[fl as Fulfillment] && paymentsFor(value, fl).length === 0) return { ok: false, error: 'no_payment_for_delivery' };
  }
  return { ok: true, value };
}

/** Junta a configuração de um módulo nas definições existentes sem apagar outras chaves (ex.: low_stock). */
export function mergeSettings(existing: Record<string, unknown> | null | undefined, mod: OrderModule, value: OrderSettingsValue): Record<string, unknown> {
  const base = existing ?? {};
  return { ...base, [mod]: { ...((base[mod] as Record<string, unknown>) ?? {}), ...value } };
}

/* ---------- horário ---------- */
export interface HoursRow { weekday: number; is_open: boolean; opens: string; closes: string }
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
export function validateHours(rows: HoursRow[]): { ok: true } | { ok: false; weekday: number } {
  for (const r of rows) {
    if (!r.is_open) continue;
    if (!HHMM.test(r.opens) || !HHMM.test(r.closes) || r.closes <= r.opens) return { ok: false, weekday: r.weekday };
  }
  return { ok: true };
}

/* ---------- negócio ---------- */
export interface BusinessForm { name: string; address: string; whatsapp: string; country: string; timezone: string; locale: string; is_published: boolean }
export type BusinessError = 'name' | 'whatsapp' | 'country' | 'timezone' | 'locale';
export interface BusinessPatch { name: string; address: string | null; whatsapp: string | null; country: string; timezone: string; locale: string; is_published: boolean }
const LOCALES = ['pt-PT', 'pt-BR', 'en', 'es'];

export function buildBusinessPatch(f: BusinessForm): { ok: true; patch: BusinessPatch } | { ok: false; error: BusinessError } {
  const name = f.name.trim();
  if (name.length < 2 || name.length > 80) return { ok: false, error: 'name' };
  if (!COUNTRIES.some((c) => c.code === f.country)) return { ok: false, error: 'country' };
  if (!LOCALES.includes(f.locale)) return { ok: false, error: 'locale' };
  try { new Intl.DateTimeFormat('en', { timeZone: f.timezone }); } catch { return { ok: false, error: 'timezone' }; }
  let whatsapp: string | null = null;
  if (f.whatsapp.trim() !== '') {
    whatsapp = toE164Digits(f.whatsapp, f.country);
    if (!whatsapp) return { ok: false, error: 'whatsapp' };
  }
  return { ok: true, patch: { name, address: f.address.trim().slice(0, 200) || null, whatsapp, country: f.country, timezone: f.timezone, locale: f.locale, is_published: f.is_published } };
}
