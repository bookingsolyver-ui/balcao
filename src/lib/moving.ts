import { toMinor } from './money';
import { isValidEmail } from './email';
import { minorToInput } from './items';
import { toE164Digits } from './phone';

/* ---------- estados ---------- */
export type MoveStatus = 'new' | 'visit' | 'quoted' | 'accepted' | 'confirmed' | 'done' | 'lost';
export const MOVE_STATUSES: MoveStatus[] = ['new', 'visit', 'quoted', 'accepted', 'confirmed', 'done', 'lost'];
/** Percurso normal de um pedido (o "perdido" fica à parte). */
export const MOVE_FLOW: MoveStatus[] = ['new', 'visit', 'quoted', 'accepted', 'confirmed', 'done'];
export const isLiveMove = (s: string): boolean => s !== 'done' && s !== 'lost';
/** Passos que o negócio pode dar a partir de cada estado. */
export function moveActions(s: string): MoveStatus[] {
  return ({ new: ['visit', 'quoted', 'lost'], visit: ['quoted', 'lost'], quoted: ['accepted', 'lost'], accepted: ['confirmed', 'lost'], confirmed: ['done', 'lost'], done: [], lost: ['new'] } as Record<string, MoveStatus[]>)[s] ?? [];
}
/** Regras que a base de dados também impõe (para avisar antes de tentar guardar). */
export function moveGuard(to: string, f: { quoted: string; confirmedDate: string }): 'quote_required' | 'date_required' | null {
  if (['quoted', 'accepted', 'confirmed', 'done'].includes(to) && f.quoted.trim() === '') return 'quote_required';
  if (['confirmed', 'done'].includes(to) && !/^\d{4}-\d{2}-\d{2}$/.test(f.confirmedDate)) return 'date_required';
  return null;
}

export type TimeWindow = 'any' | 'morning' | 'afternoon';
export type MoveType = 'home' | 'office' | 'furniture';
export interface MoveRow {
  id: string; number: number; status: MoveStatus; customer_name: string; customer_phone: string; customer_email: string | null;
  move_type: MoveType; volume_m3: number;
  origin_street: string; origin_city: string; origin_postal: string | null; origin_floor: number | null; origin_elevator: boolean | null; origin_access: string | null;
  dest_street: string; dest_city: string; dest_postal: string | null; dest_floor: number | null; dest_elevator: boolean | null; dest_access: string | null;
  extras: string[]; special_items: string[]; preferred_date: string | null; date_flexible: boolean; time_window: TimeWindow; notes: string | null;
  distance_km: number | null; quoted_minor: number | null; currency: string; quote_note: string | null;
  confirmed_date: string | null; confirmed_window: TimeWindow | null; crew: string | null; internal_notes: string | null; lost_reason: string | null;
  public_token: string; created_at: string;
}
export interface MoveTrack {
  number: number; status: MoveStatus; move_type: MoveType; volume_m3: number; origin_city: string; dest_city: string; preferred_date: string | null; date_flexible: boolean;
  time_window: TimeWindow; confirmed_date: string | null; confirmed_window: TimeWindow | null; currency: string; customer_first_name: string;
  quoted_minor: number | null; quote_note: string | null; can_respond: boolean; tenant_slug?: string;
}

/* ---------- definições do nicho (settings.moving) ---------- */
export interface MoveSettings {
  rate_per_m3_minor: number; min_price_minor: number; per_floor_minor: number; max_jobs_per_day: number;
  typologies: { key: string; m3: number }[]; extras: { name: string; price_minor: number }[]; special_items: string[]; crews: string[]; privacy_url: string;
}
/** Valores INDICATIVOS de partida (m³ por tipologia). Cada empresa deve ajustá-los à sua realidade nas Definições. */
export const DEFAULT_MOVING: MoveSettings = {
  rate_per_m3_minor: 0, min_price_minor: 0, per_floor_minor: 0, max_jobs_per_day: 2,
  typologies: [{ key: 'T0', m3: 10 }, { key: 'T1', m3: 18 }, { key: 'T2', m3: 28 }, { key: 'T3', m3: 40 }, { key: 'T4', m3: 52 }, { key: 'T5+', m3: 65 }],
  extras: [{ name: 'Embalagem', price_minor: 0 }, { name: 'Desmontagem e montagem de móveis', price_minor: 0 }, { name: 'Elevador de mobiliário (grua)', price_minor: 0 }, { name: 'Armazenamento temporário', price_minor: 0 }],
  special_items: ['Piano', 'Cofre', 'Aquário', 'Obras de arte / objetos frágeis', 'Máquina de lavar / secar', 'Bicicletas / motas', 'Plantas'],
  crews: [], privacy_url: '',
};
export function movingConfig(settings: Record<string, unknown> | null | undefined): MoveSettings {
  const s = ((settings?.moving ?? {}) as Partial<MoveSettings>);
  const arr = <T,>(v: unknown, d: T[]): T[] => (Array.isArray(v) ? (v as T[]) : d);
  return { ...DEFAULT_MOVING, ...s, typologies: arr(s.typologies, DEFAULT_MOVING.typologies), extras: arr(s.extras, DEFAULT_MOVING.extras), special_items: arr(s.special_items, DEFAULT_MOVING.special_items), crews: arr(s.crews, DEFAULT_MOVING.crews) };
}
export const estimateVolume = (key: string, cfg: MoveSettings): number | null => cfg.typologies.find((t) => t.key === key)?.m3 ?? null;

/* ---------- formulário do cliente -> pedido ---------- */
export interface AddressForm { street: string; city: string; postal: string; floor: string; elevator: '' | 'yes' | 'no'; access: string }
export interface MoveForm {
  moveType: MoveType; volume: string; origin: AddressForm; destination: AddressForm; extras: string[]; special: string[];
  preferredDate: string; flexible: boolean; window: TimeWindow; notes: string; name: string; phone: string; email: string; consent: boolean;
}
export const emptyAddress = (): AddressForm => ({ street: '', city: '', postal: '', floor: '', elevator: '', access: '' });
export const emptyMoveForm = (): MoveForm => ({ moveType: 'home', volume: '', origin: emptyAddress(), destination: emptyAddress(), extras: [], special: [], preferredDate: '', flexible: false, window: 'any', notes: '', name: '', phone: '', email: '', consent: false });
export type MoveFormError = 'name' | 'phone' | 'email' | 'volume' | 'origin' | 'destination' | 'origin_postal' | 'destination_postal' | 'origin_floor' | 'destination_floor' | 'date' | 'day_full' | 'consent' | 'notes';

/** Código postal português: aceita "1000123" e devolve "1000-123". */
export function normalizePostalPT(v: string): string | null {
  const d = v.trim().replace(/\s+/g, '');
  if (/^\d{4}-\d{3}$/.test(d)) return d;
  return /^\d{7}$/.test(d) ? `${d.slice(0, 4)}-${d.slice(4)}` : null;
}
export function parseVolume(s: string): number | null {
  const n = Number(s.trim().replace(',', '.'));
  return /^\d+([.,]\d+)?$/.test(s.trim()) && Number.isFinite(n) && n > 0 && n <= 999 ? Math.round(n * 10) / 10 : null;
}

export interface MovePayload {
  name: string; phone: string; email: string | null; move_type: MoveType; volume_m3: number;
  origin: { street: string; city: string; postal: string | null; floor: number | null; elevator: boolean | null; access: string | null };
  destination: { street: string; city: string; postal: string | null; floor: number | null; elevator: boolean | null; access: string | null };
  extras: string[]; special_items: string[]; preferred_date: string | null; date_flexible: boolean; time_window: TimeWindow; notes: string | null; consent: true;
}
type AddrCtx = { country: string };
type AddrOk = { value: { street: string; city: string; postal: string | null; floor: number | null; elevator: boolean | null; access: string | null } };
/** Regras de uma morada (usadas tanto na validação de um passo como no envio final — nunca duplicadas). */
function validateAddress(a: AddressForm, which: 'origin' | 'destination', ctx: AddrCtx): AddrOk | { error: MoveFormError } {
  if (a.street.trim().length < 3 || a.city.trim().length < 2) return { error: which };
  let postal: string | null = a.postal.trim() || null;
  if (postal && ctx.country === 'PT') { postal = normalizePostalPT(postal); if (!postal) return { error: `${which}_postal` as MoveFormError }; }
  let floor: number | null = null;
  if (a.floor.trim() !== '') { const n = Number(a.floor.trim()); if (!/^-?\d{1,2}$/.test(a.floor.trim()) || n < -5 || n > 60) return { error: `${which}_floor` as MoveFormError }; floor = n; }
  return { value: { street: a.street.trim(), city: a.city.trim(), postal, floor, elevator: a.elevator === 'yes' ? true : a.elevator === 'no' ? false : null, access: a.access.trim().slice(0, 300) || null } };
}
function validateDate(f: MoveForm, ctx: { today: string; fullDays: string[] }): MoveFormError | null {
  if (!f.preferredDate) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.preferredDate) || f.preferredDate < ctx.today) return 'date';
  if (ctx.fullDays.includes(f.preferredDate) && !f.flexible) return 'day_full';
  return null;
}
function validateContact(f: MoveForm, ctx: { country: string }): MoveFormError | null {
  if (f.name.trim().length < 2) return 'name';
  if (!toE164Digits(f.phone, ctx.country)) return 'phone';
  if (f.email.trim() && !isValidEmail(f.email.trim())) return 'email';
  if (f.notes.length > 2000) return 'notes';
  if (!f.consent) return 'consent';
  return null;
}

/** Quantas etapas tem o formulário — a 4ª (extras/especiais) só existe se o negócio tiver configurado alguma coisa. */
export function moveStepCount(cfg: MoveSettings): number { return cfg.extras.length > 0 || cfg.special_items.length > 0 ? 6 : 5; }
/** Valida só os campos da etapa atual, para decidir se pode avançar — as mesmas regras do envio final, nunca duplicadas à parte. */
export function moveStepError(step: number, hasExtrasStep: boolean, f: MoveForm, ctx: { country: string; today: string; fullDays: string[] }): MoveFormError | null {
  const s = hasExtrasStep ? step : step >= 4 ? step + 1 : step; // sem a etapa de extras, a numeração "salta" para bater com moveStepCount
  if (s === 1) return parseVolume(f.volume) === null ? 'volume' : null;
  if (s === 2) { const r = validateAddress(f.origin, 'origin', ctx); return 'error' in r ? r.error : null; }
  if (s === 3) { const r = validateAddress(f.destination, 'destination', ctx); return 'error' in r ? r.error : null; }
  if (s === 4) return null; // extras/especiais: nunca obrigatório
  if (s === 5) return validateDate(f, ctx);
  return validateContact(f, ctx);
}

export function buildMoveRequest(f: MoveForm, ctx: { country: string; today: string; fullDays: string[] }): { ok: true; payload: MovePayload } | { ok: false; error: MoveFormError } {
  const contactErr = validateContact(f, ctx);
  if (contactErr) return { ok: false, error: contactErr };
  const phone = toE164Digits(f.phone, ctx.country)!;
  const vol = parseVolume(f.volume);
  if (vol === null) return { ok: false, error: 'volume' };

  const o = validateAddress(f.origin, 'origin', ctx); if ('error' in o) return { ok: false, error: o.error };
  const d = validateAddress(f.destination, 'destination', ctx); if ('error' in d) return { ok: false, error: d.error };
  const dateErr = validateDate(f, ctx); if (dateErr) return { ok: false, error: dateErr };

  return {
    ok: true,
    payload: { name: f.name.trim(), phone, email: f.email.trim() || null, move_type: f.moveType, volume_m3: vol, origin: o.value, destination: d.value, extras: [...new Set(f.extras)], special_items: [...new Set(f.special)],
      preferred_date: f.preferredDate || null, date_flexible: f.flexible, time_window: f.window, notes: f.notes.trim() || null, consent: true },
  };
}

/* ---------- sugestão de orçamento (o negócio decide o valor final) ---------- */
export function suggestQuote(r: { volume_m3: number; origin_floor: number | null; origin_elevator: boolean | null; dest_floor: number | null; dest_elevator: boolean | null; extras: string[] }, cfg: MoveSettings): number | null {
  if (!(cfg.rate_per_m3_minor > 0)) return null; // sem tarifa definida não há sugestão
  let total = Math.max(cfg.min_price_minor, Math.round(r.volume_m3 * cfg.rate_per_m3_minor));
  const climb = (floor: number | null, elevator: boolean | null) => (elevator === false && floor && floor > 0 ? floor * cfg.per_floor_minor : 0); // sem elevador cobra por andar
  total += climb(r.origin_floor, r.origin_elevator) + climb(r.dest_floor, r.dest_elevator);
  for (const e of r.extras) total += cfg.extras.find((x) => x.name === e)?.price_minor ?? 0;
  return total;
}

/* ---------- definições: formulário e validação ---------- */
export interface MovingSettingsForm {
  rate: string; min: string; perFloor: string; capacity: string; typologies: { key: string; m3: string }[]; extras: { name: string; price: string }[];
  special: string; crews: string; privacy: string;
}
export const toMovingSettingsForm = (c: MoveSettings, decimals: number): MovingSettingsForm => ({
  rate: c.rate_per_m3_minor ? minorToInput(c.rate_per_m3_minor, decimals) : '', min: c.min_price_minor ? minorToInput(c.min_price_minor, decimals) : '', perFloor: c.per_floor_minor ? minorToInput(c.per_floor_minor, decimals) : '',
  capacity: String(c.max_jobs_per_day), typologies: c.typologies.map((t) => ({ key: t.key, m3: String(t.m3) })),
  extras: c.extras.map((e) => ({ name: e.name, price: e.price_minor ? minorToInput(e.price_minor, decimals) : '' })), special: c.special_items.join(', '), crews: c.crews.join(', '), privacy: c.privacy_url,
});
export type MovingSettingsError = 'rate' | 'min' | 'perFloor' | 'capacity' | 'typology' | 'extra' | 'privacy';
export function buildMovingSettings(f: MovingSettingsForm, ctx: { currency: string; decimals: number }): { ok: true; value: MoveSettings } | { ok: false; error: MovingSettingsError } {
  const money = (s: string): number | null => (s.trim() === '' ? 0 : toMinor(s, ctx.currency, ctx.decimals));
  const rate = money(f.rate), min = money(f.min), perFloor = money(f.perFloor);
  if (rate === null || rate < 0) return { ok: false, error: 'rate' };
  if (min === null || min < 0) return { ok: false, error: 'min' };
  if (perFloor === null || perFloor < 0) return { ok: false, error: 'perFloor' };
  if (!/^\d{1,2}$/.test(f.capacity.trim()) || Number(f.capacity) < 1) return { ok: false, error: 'capacity' };
  const typologies: MoveSettings['typologies'] = [];
  for (const t of f.typologies) { const v = parseVolume(t.m3); if (!t.key.trim() || t.key.length > 12 || v === null) return { ok: false, error: 'typology' }; typologies.push({ key: t.key.trim(), m3: v }); }
  const extras: MoveSettings['extras'] = [];
  for (const e of f.extras) {
    const name = e.name.trim(); if (!name) continue;
    const p = money(e.price); if (name.length > 80 || p === null || p < 0) return { ok: false, error: 'extra' };
    extras.push({ name, price_minor: p });
  }
  const list = (s: string) => [...new Set(s.split(',').map((x) => x.trim().slice(0, 80)).filter(Boolean))].slice(0, 20);
  const privacy = f.privacy.trim();
  if (privacy && !/^https?:\/\/\S+$/i.test(privacy)) return { ok: false, error: 'privacy' };
  return { ok: true, value: { rate_per_m3_minor: rate, min_price_minor: min, per_floor_minor: perFloor, max_jobs_per_day: Number(f.capacity), typologies, extras: extras.slice(0, 20), special_items: list(f.special), crews: list(f.crews), privacy_url: privacy } };
}
export const mergeMoving = (existing: Record<string, unknown> | null | undefined, v: MoveSettings): Record<string, unknown> =>
  ({ ...(existing ?? {}), moving: { ...(((existing ?? {}).moving as object) ?? {}), ...v } });

/* ---------- mensagem de WhatsApp: cliente -> empresa (tudo o que é preciso para orçamentar) ---------- */
export interface MoveMessageInput {
  number: number; business: string; name: string; phone: string; email?: string | null; typeLabel: string; volume: string;
  origin: string; destination: string; extras: string[]; special: string[]; date: string; notes?: string | null; trackUrl?: string;
  labels: { title: string; customer: string; type: string; volume: string; from: string; to: string; extras: string; special: string; date: string; notes: string; track: string };
}
export function moveMessage(m: MoveMessageInput): string {
  const L = m.labels;
  const out = [`*${L.title} #${m.number}* — ${m.business}`, `${L.customer}: ${m.name} (+${m.phone})${m.email ? ` · ${m.email}` : ''}`, `${L.type}: ${m.typeLabel} · ${m.volume}`, `${L.from}: ${m.origin}`, `${L.to}: ${m.destination}`];
  if (m.extras.length) out.push(`${L.extras}: ${m.extras.join(', ')}`);
  if (m.special.length) out.push(`${L.special}: ${m.special.join(', ')}`);
  out.push(`${L.date}: ${m.date}`);
  if (m.notes) out.push(`${L.notes}: ${m.notes}`);
  if (m.trackUrl) out.push('', `${L.track}: ${m.trackUrl}`);
  return out.join('\n');
}
export function addressLine(street: string, city: string, postal?: string | null, floor?: number | null, elevator?: boolean | null, labels?: { floor: string; elevatorYes: string; elevatorNo: string }): string {
  const parts = [street, [postal, city].filter(Boolean).join(' ')];
  if (labels) {
    if (floor != null) parts.push(`${floor}º ${labels.floor}`.trim());
    if (elevator === true) parts.push(labels.elevatorYes); else if (elevator === false) parts.push(labels.elevatorNo);
  }
  return parts.filter(Boolean).join(', ');
}

/* ---------- exportação (substitui o Excel): CSV com ; e BOM para abrir bem no Excel PT ---------- */
export function movesToCsv(rows: MoveRow[], h: Record<string, string>, fmt: { money: (n: number) => string; status: (s: string) => string; type: (t: string) => string; window: (w: string) => string; date: (iso: string) => string }): string {
  const cols: [string, (r: MoveRow) => string | number][] = [
    [h.number, (r) => r.number], [h.status, (r) => fmt.status(r.status)], [h.created, (r) => fmt.date(r.created_at)], [h.name, (r) => r.customer_name], [h.phone, (r) => `+${r.customer_phone}`], [h.email, (r) => r.customer_email ?? ''],
    [h.type, (r) => fmt.type(r.move_type)], [h.volume, (r) => String(r.volume_m3).replace('.', ',')],
    [h.origin, (r) => [r.origin_street, r.origin_postal, r.origin_city].filter(Boolean).join(', ')], [h.originFloor, (r) => r.origin_floor ?? ''], [h.originElevator, (r) => (r.origin_elevator == null ? '' : r.origin_elevator ? h.yes : h.no)],
    [h.destination, (r) => [r.dest_street, r.dest_postal, r.dest_city].filter(Boolean).join(', ')], [h.destFloor, (r) => r.dest_floor ?? ''], [h.destElevator, (r) => (r.dest_elevator == null ? '' : r.dest_elevator ? h.yes : h.no)],
    [h.extras, (r) => r.extras.join(' | ')], [h.special, (r) => r.special_items.join(' | ')], [h.preferred, (r) => r.preferred_date ?? ''], [h.window, (r) => fmt.window(r.time_window)],
    [h.price, (r) => (r.quoted_minor == null ? '' : fmt.money(r.quoted_minor))], [h.confirmed, (r) => r.confirmed_date ?? ''], [h.crew, (r) => r.crew ?? ''], [h.notes, (r) => r.notes ?? ''], [h.internal, (r) => r.internal_notes ?? ''],
  ];
  const esc = (v: string | number) => { const s = String(v); return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return '\ufeff' + [cols.map(([n]) => esc(n)).join(';'), ...rows.map((r) => cols.map(([, f]) => esc(f(r))).join(';'))].join('\r\n');
}
