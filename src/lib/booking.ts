import { toMinor } from './money';
import { minorToInput } from './items';
import { toE164Digits } from './phone';

export interface ServiceRow { id: string; name: string; description: string; duration_min: number; price_minor: number; active: boolean; position?: number }
export interface StaffRow { id: string; name: string; active: boolean }
export interface HoursRow { weekday: number; is_open: boolean; opens: string; closes: string }
export interface BookingRow {
  id: string; service_name: string; staff_name: string; duration_min: number; price_minor: number; starts_at: string; ends_at: string;
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'no_show'; customer_name: string; customer_phone: string; note: string | null; staff_id: string | null; public_token: string;
}
export interface SlotRow { out_time: string; out_staff: string }
export interface TrackBooking { status: BookingRow['status']; service_name: string; staff_name: string; starts_at: string; duration_min: number; price_minor: number; tenant_slug?: string }

/* ---------- estados ---------- */
export const isLiveBooking = (s: string): boolean => s === 'pending' || s === 'confirmed';
/** Ações que o negócio pode fazer a partir de cada estado (a base de dados impede reabrir os finais). */
export const bookingActions = (s: string): ('confirmed' | 'completed' | 'no_show' | 'cancelled')[] =>
  s === 'pending' ? ['confirmed', 'cancelled'] : s === 'confirmed' ? ['completed', 'no_show', 'cancelled'] : [];

/* ---------- datas no fuso horário do negócio (nunca no do visitante) ---------- */
const pad = (n: number) => String(n).padStart(2, '0');
export function ymdInTz(d: Date, tz: string): string {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d);
  const g = (t: string) => p.find((x) => x.type === t)!.value;
  return `${g('year')}-${g('month')}-${g('day')}`;
}
export const todayInTz = (tz: string, now: Date = new Date()): string => ymdInTz(now, tz);
export function addDays(ymd: string, n: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}
export function weekdayOf(ymd: string): number {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}
/** Diferença (em minutos) entre a hora local do fuso e UTC, no instante dado. */
function tzOffsetMin(utc: Date, tz: string): number {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(utc);
  const g = (t: string) => Number(p.find((x) => x.type === t)!.value);
  return (Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'), g('second')) - Math.floor(utc.getTime() / 1000) * 1000) / 60000;
}
/** "2026-09-21" + "09:30" no fuso tz -> instante UTC (trata mudanças de hora de verão). */
export function zonedToUtc(ymd: string, hhmm: string, tz: string): Date {
  const [y, m, d] = ymd.split('-').map(Number), [h, mi] = hhmm.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, h, mi);
  const o1 = tzOffsetMin(new Date(guess), tz);
  let utc = guess - o1 * 60000;
  const o2 = tzOffsetMin(new Date(utc), tz);
  if (o2 !== o1) utc = guess - o2 * 60000;
  return new Date(utc);
}
/** Intervalo [início, fim) em UTC do dia local. */
export const dayRangeUtc = (ymd: string, tz: string): { from: string; to: string } => ({ from: zonedToUtc(ymd, '00:00', tz).toISOString(), to: zonedToUtc(addDays(ymd, 1), '00:00', tz).toISOString() });
export function timeInTz(iso: string, tz: string): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso));
}
export const hhmm = (t: string): string => t.slice(0, 5);

/** Dias que o cliente pode escolher (hoje até hoje + dias de antecedência); fechados e bloqueados ficam desativados. */
export function dayList(today: string, ahead: number, hours: HoursRow[], blocked: string[]): { date: string; weekday: number; disabled: boolean }[] {
  return Array.from({ length: Math.max(0, ahead) + 1 }, (_, i) => {
    const date = addDays(today, i), weekday = weekdayOf(date);
    const h = hours.find((r) => r.weekday === weekday);
    return { date, weekday, disabled: !h?.is_open || blocked.includes(date) };
  });
}

/* ---------- formulário de marcação ---------- */
export interface BookingForm { serviceId: string; staffId: string; date: string; time: string; name: string; phone: string; note: string }
export type BookingFormError = 'service' | 'date' | 'time' | 'name' | 'phone';
export interface CreateBookingParams { p_slug: string; p_service: string; p_staff: string | null; p_date: string; p_time: string; p_customer_name: string; p_customer_phone: string; p_note: string | null }
export function buildBookingParams(f: BookingForm, ctx: { slug: string; country: string }): { ok: true; params: CreateBookingParams } | { ok: false; error: BookingFormError } {
  if (!f.serviceId) return { ok: false, error: 'service' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.date)) return { ok: false, error: 'date' };
  if (!/^\d{2}:\d{2}$/.test(f.time)) return { ok: false, error: 'time' };
  const name = f.name.trim();
  if (name.length < 2) return { ok: false, error: 'name' };
  const phone = toE164Digits(f.phone, ctx.country);
  if (!phone) return { ok: false, error: 'phone' };
  return { ok: true, params: { p_slug: ctx.slug, p_service: f.serviceId, p_staff: f.staffId && f.staffId !== 'any' ? f.staffId : null, p_date: f.date, p_time: f.time, p_customer_name: name, p_customer_phone: phone, p_note: f.note.trim().slice(0, 300) || null } };
}

/** Link "Adicionar ao Google Agenda" (instantes em UTC, sem ambiguidade de fuso). */
export function calendarLink(o: { title: string; startsAt: string; durationMin: number; details?: string; location?: string }): string {
  const f = (d: Date) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`;
  const s = new Date(o.startsAt), e = new Date(s.getTime() + o.durationMin * 60000);
  const q = new URLSearchParams({ action: 'TEMPLATE', text: o.title, dates: `${f(s)}/${f(e)}` });
  if (o.details) q.set('details', o.details);
  if (o.location) q.set('location', o.location);
  return `https://calendar.google.com/calendar/render?${q.toString()}`;
}

/* ---------- serviços ---------- */
export interface ServiceForm { name: string; description: string; duration: string; price: string; active: boolean }
export type ServiceError = 'name' | 'duration' | 'price';
export function buildService(f: ServiceForm, ctx: { currency: string; decimals: number }): { ok: true; value: { name: string; description: string; duration_min: number; price_minor: number; active: boolean } } | { ok: false; error: ServiceError } {
  const name = f.name.trim();
  if (name.length < 1 || name.length > 120) return { ok: false, error: 'name' };
  if (!/^\d{1,3}$/.test(f.duration.trim()) || Number(f.duration) < 5 || Number(f.duration) > 720) return { ok: false, error: 'duration' };
  const price = f.price.trim() === '' ? 0 : toMinor(f.price, ctx.currency, ctx.decimals);
  if (price === null || price < 0 || price > 1_000_000_000_000) return { ok: false, error: 'price' };
  return { ok: true, value: { name, description: f.description.trim().slice(0, 500), duration_min: Number(f.duration), price_minor: price, active: f.active } };
}
export const toServiceForm = (s: ServiceRow | null, decimals: number): ServiceForm =>
  ({ name: s?.name ?? '', description: s?.description ?? '', duration: String(s?.duration_min ?? 60), price: s ? minorToInput(s.price_minor, decimals) : '', active: s?.active ?? true });

/* ---------- regras da agenda (settings.agenda) ---------- */
export interface AgendaConfig { slot_step_min: number; days_ahead: number; min_notice_hours: number; auto_confirm: boolean }
export const DEFAULT_AGENDA: AgendaConfig = { slot_step_min: 30, days_ahead: 21, min_notice_hours: 2, auto_confirm: true };
export function agendaConfig(settings: Record<string, unknown> | null | undefined): AgendaConfig {
  return { ...DEFAULT_AGENDA, ...((settings?.agenda ?? {}) as Partial<AgendaConfig>) };
}
export interface AgendaSettingsForm { slot_step_min: string; days_ahead: string; min_notice_hours: string; auto_confirm: boolean }
export const toAgendaSettingsForm = (c: AgendaConfig): AgendaSettingsForm => ({ slot_step_min: String(c.slot_step_min), days_ahead: String(c.days_ahead), min_notice_hours: String(c.min_notice_hours), auto_confirm: c.auto_confirm });
export type AgendaSettingsError = 'step' | 'ahead' | 'notice';
export function buildAgendaSettings(f: AgendaSettingsForm): { ok: true; value: AgendaConfig } | { ok: false; error: AgendaSettingsError } {
  const int = (s: string) => (/^\d{1,4}$/.test(s.trim()) ? Number(s) : NaN);
  const step = int(f.slot_step_min), ahead = int(f.days_ahead), notice = int(f.min_notice_hours);
  if (!(step >= 5 && step <= 240)) return { ok: false, error: 'step' };
  if (!(ahead >= 1 && ahead <= 365)) return { ok: false, error: 'ahead' };
  if (!(notice >= 0 && notice <= 168)) return { ok: false, error: 'notice' };
  return { ok: true, value: { slot_step_min: step, days_ahead: ahead, min_notice_hours: notice, auto_confirm: f.auto_confirm } };
}
export const mergeAgenda = (existing: Record<string, unknown> | null | undefined, v: AgendaConfig): Record<string, unknown> =>
  ({ ...(existing ?? {}), agenda: { ...(((existing ?? {}).agenda as object) ?? {}), ...v } });
