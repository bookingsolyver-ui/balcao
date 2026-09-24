import { toMinor } from './money';
import { minorToInput } from './items';
import { COUNTRIES } from './countries';
import { toE164Digits } from './phone';
import { formatIban, isValidIban, normalizeIban } from './iban';
import { FULFILLMENTS, PAY_METHODS, type Fulfillment, type OrderConfig, type OrderModule } from './order';
import { paymentsFor } from './payments';

/* ---------- pedidos (por módulo) ---------- */
export interface OrderSettingsForm { pickup: boolean; delivery: boolean; dine_in: boolean; fee: string; min: string; eta: string; payments: string[]; only_when_open: boolean }
export type OrderSettingsError = 'fee' | 'min' | 'eta' | 'no_fulfillment' | 'no_payment' | 'no_payment_for_delivery';
export type OrderSettingsValue = Pick<OrderConfig, 'pickup' | 'delivery' | 'dine_in' | 'fee_minor' | 'min_minor' | 'eta' | 'payments'> & { only_when_open: boolean };

export function toOrderSettingsForm(cfg: OrderConfig, decimals: number): OrderSettingsForm {
  return { pickup: cfg.pickup, delivery: cfg.delivery, dine_in: cfg.dine_in, fee: minorToInput(cfg.fee_minor, decimals), min: minorToInput(cfg.min_minor, decimals), eta: cfg.eta, payments: [...cfg.payments], only_when_open: cfg.only_when_open === true };
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
  const value: OrderSettingsValue = { pickup: f.pickup, delivery: f.delivery, dine_in, fee_minor: fee, min_minor: min, eta, payments, only_when_open: f.only_when_open === true };
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

/* ---------- dados para pagamento (Multicaixa Express, IBAN) — um só por negócio, partilhado por todos os módulos ---------- */
export interface PaymentDetailsValue { express_number: string | null; express_holder: string | null; iban: string | null; iban_holder: string | null }
export interface PaymentDetailsForm { expressNumber: string; expressHolder: string; iban: string; ibanHolder: string }
export type PaymentDetailsError = 'express_number' | 'iban';
const EMPTY_PAYMENT_DETAILS: PaymentDetailsValue = { express_number: null, express_holder: null, iban: null, iban_holder: null };

export function paymentDetails(settings: Record<string, unknown> | null | undefined): PaymentDetailsValue {
  const p = (settings?.payment_details ?? {}) as Partial<PaymentDetailsValue>;
  return { express_number: p.express_number ?? null, express_holder: p.express_holder ?? null, iban: p.iban ?? null, iban_holder: p.iban_holder ?? null };
}
export function toPaymentDetailsForm(v: PaymentDetailsValue): PaymentDetailsForm {
  return { expressNumber: v.express_number ? `+${v.express_number}` : '', expressHolder: v.express_holder ?? '', iban: v.iban ? formatIban(v.iban) : '', ibanHolder: v.iban_holder ?? '' };
}
/** Todos os campos são opcionais — um negócio pode não usar Express nem transferência. */
export function buildPaymentDetails(f: PaymentDetailsForm, country: string): { ok: true; value: PaymentDetailsValue } | { ok: false; error: PaymentDetailsError } {
  let express_number: string | null = null;
  if (f.expressNumber.trim() !== '') {
    express_number = toE164Digits(f.expressNumber, country);
    if (!express_number) return { ok: false, error: 'express_number' };
  }
  let iban: string | null = null;
  if (f.iban.trim() !== '') {
    const norm = normalizeIban(f.iban);
    if (!isValidIban(norm)) return { ok: false, error: 'iban' };
    iban = norm;
  }
  return { ok: true, value: { express_number, express_holder: f.expressHolder.trim().slice(0, 80) || null, iban, iban_holder: f.ibanHolder.trim().slice(0, 80) || null } };
}
export const mergePaymentDetails = (existing: Record<string, unknown> | null | undefined, value: PaymentDetailsValue): Record<string, unknown> =>
  ({ ...(existing ?? {}), payment_details: value.express_number || value.iban ? value : EMPTY_PAYMENT_DETAILS });

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
