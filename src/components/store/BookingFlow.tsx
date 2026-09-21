'use client';
import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import { dbErrorKey } from '@/lib/errors';
import { formatMoney } from '@/lib/money';
import { waLink } from '@/lib/phone';
import { buildBookingParams, calendarLink, dayList, hhmm, timeInTz, todayInTz, type BookingForm, type HoursRow, type ServiceRow, type SlotRow, type StaffRow } from '@/lib/booking';

export interface BookingTenant { name: string; country: string; currency: string; decimals: number; moneyLocale: string; timezone: string; whatsapp: string | null; address?: string | null }
export interface DoneInfo { booking_id: string; status: string; starts_at: string; staff_name: string; public_token: string }
export interface BookingFlowProps {
  mode: 'public' | 'admin'; slug: string; tenant: BookingTenant; services: ServiceRow[]; staff: StaffRow[]; hours: HoursRow[]; blocked: string[]; daysAhead: number; autoConfirm: boolean;
  onDone?: () => void;
  /** Só para testes/SSR. */
  initial?: Partial<Pick<BookingForm, 'serviceId' | 'staffId' | 'date' | 'time'>>; initialSlots?: SlotRow[]; initialResult?: DoneInfo;
}
const CUSTOMER_KEY = 'balcao:customer';
const KNOWN = ['service', 'date', 'time', 'name', 'phone', 'slot_unavailable', 'too_many_bookings', 'invalid_phone', 'invalid_name', 'service_unavailable', 'tenant_not_found', 'generic'];

export function BookingFlow(p: BookingFlowProps) {
  const t = useTranslations('booking');
  const tt = t as unknown as (key: string, values?: Record<string, string | number>) => string;
  const locale = useLocale();
  const { tenant } = p;
  const [form, setForm] = useState<BookingForm>({ serviceId: p.initial?.serviceId ?? '', staffId: p.initial?.staffId ?? 'any', date: p.initial?.date ?? '', time: p.initial?.time ?? '', name: '', phone: '', note: '' });
  const [slots, setSlots] = useState<SlotRow[] | null>(p.initialSlots ?? null);
  const [tick, setTick] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<DoneInfo | null>(p.initialResult ?? null);
  const money = (n: number) => formatMoney(n, tenant.currency, tenant.moneyLocale, tenant.decimals);
  const set = <K extends keyof BookingForm>(k: K, v: BookingForm[K]) => setForm((f) => ({ ...f, [k]: v }));
  const service = p.services.find((s) => s.id === form.serviceId);
  const days = dayList(todayInTz(tenant.timezone), p.daysAhead, p.hours, p.blocked);
  const dayFmt = (ymd: string, o: Intl.DateTimeFormatOptions) => { const [y, m, d] = ymd.split('-').map(Number); return new Intl.DateTimeFormat(locale, { ...o, timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d))); };

  useEffect(() => {
    try { const s = JSON.parse(localStorage.getItem(CUSTOMER_KEY) ?? 'null') as { name?: string; phone?: string } | null; if (s) setForm((f) => ({ ...f, name: s.name ?? '', phone: s.phone ?? '' })); } catch { /* sem dados */ }
  }, []);
  useEffect(() => {
    if (!form.serviceId || !form.date) return;
    let live = true;
    setSlots(null);
    createClient().rpc('available_slots', { p_slug: p.slug, p_service: form.serviceId, p_staff: form.staffId === 'any' ? null : form.staffId, p_date: form.date })
      .then((r) => { if (live) setSlots((r.data ?? []) as SlotRow[]); });
    return () => { live = false; };
  }, [form.serviceId, form.staffId, form.date, p.slug, tick]);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr(null);
    const b = buildBookingParams(form, { slug: p.slug, country: tenant.country });
    if (!b.ok) return setErr(b.error);
    setBusy(true);
    try {
      const { data, error } = await createClient().rpc('create_booking', b.params);
      if (error) { const k = dbErrorKey(error); setErr(KNOWN.includes(k) ? k : 'generic'); if (k === 'slot_unavailable') { set('time', ''); setTick((x) => x + 1); } return; }
      try { localStorage.setItem(CUSTOMER_KEY, JSON.stringify({ name: form.name.trim(), phone: form.phone.trim() })); } catch { /* ok */ }
      setResult(data as DoneInfo);
    } catch { setErr('generic'); } finally { setBusy(false); }
  }

  if (result && service) {
    const when = new Intl.DateTimeFormat(locale, { dateStyle: 'full', timeZone: tenant.timezone }).format(new Date(result.starts_at));
    const time = timeInTz(result.starts_at, tenant.timezone);
    const url = typeof window === 'undefined' ? '' : `${window.location.origin}/${locale}/s/${p.slug}/booking/${result.public_token}`;
    const msg = tt('waMessage', { business: tenant.name, service: service.name, staff: result.staff_name, date: when, time, name: form.name.trim() })
      + (form.note.trim() ? `\n${tt('waNote', { note: form.note.trim() })}` : '') + (url ? `\n${tt('waLink', { url })}` : '');
    return (
      <div className="card" style={{ textAlign: 'center' }}>
        <div className="done-i" aria-hidden="true">✓</div>
        <h2 style={{ fontSize: 24, fontWeight: 700 }}>{result.status === 'confirmed' ? t('doneConfirmed') : t('donePending')}</h2>
        <p className="muted" style={{ margin: '8px 0 18px' }}>{tt('doneText', { service: service.name, date: when, time, staff: result.staff_name })}{result.status === 'pending' ? ` ${t('pendingText')}` : ''}</p>
        <div className="form" style={{ textAlign: 'left' }}>
          {p.mode === 'public' && tenant.whatsapp && <a className="btn wa block" target="_blank" rel="noopener" href={waLink(tenant.whatsapp, msg)}>{t('sendWhatsapp')}</a>}
          {p.mode === 'public' && <a className="btn ghost block" href={`/${locale}/s/${p.slug}/booking/${result.public_token}`}>{t('viewBooking')}</a>}
          <a className="btn gray block" target="_blank" rel="noopener" href={calendarLink({ title: `${service.name} — ${tenant.name}`, startsAt: result.starts_at, durationMin: service.duration_min, details: result.staff_name, location: tenant.address ?? undefined })}>{t('addCalendar')}</a>
          {p.mode === 'admin' ? <button className="btn block" onClick={() => p.onDone?.()}>{t('close')}</button>
            : <button className="btn gray block" onClick={() => { setResult(null); setForm((f) => ({ ...f, serviceId: '', date: '', time: '', note: '' })); }}>{t('another')}</button>}
        </div>
      </div>
    );
  }

  if (p.services.length === 0) return <div className="card muted">{t('noServices')}</div>;
  const errText = err ? tt(`errors.${err}`) : null;
  return (
    <div>
      <h2 className="sf-h2" style={{ fontSize: 22, fontWeight: 700, margin: '0 0 10px' }}>{t('chooseService')}</h2>
      {p.services.filter((s) => s.active).map((s) => (
        <button type="button" key={s.id} className="svc" aria-pressed={form.serviceId === s.id} onClick={() => setForm({ ...form, serviceId: s.id, time: '' })}>
          <span><strong>{s.name}</strong><small>{tt('minutes', { n: s.duration_min })}{s.description ? ` · ${s.description}` : ''}</small></span>
          <b>{s.price_minor ? money(s.price_minor) : t('free')}</b>
        </button>
      ))}

      {service && (
        <>
          {p.staff.filter((s) => s.active).length > 1 && (
            <>
              <h2 style={{ fontSize: 22, fontWeight: 700, margin: '22px 0 10px' }}>{t('chooseStaff')}</h2>
              <div className="chips">
                <button type="button" className="chip" aria-pressed={form.staffId === 'any'} onClick={() => setForm({ ...form, staffId: 'any', time: '' })}>{t('anyStaff')}</button>
                {p.staff.filter((s) => s.active).map((s) => <button type="button" key={s.id} className="chip" aria-pressed={form.staffId === s.id} onClick={() => setForm({ ...form, staffId: s.id, time: '' })}>{s.name}</button>)}
              </div>
            </>
          )}
          <h2 style={{ fontSize: 22, fontWeight: 700, margin: '22px 0 10px' }}>{t('chooseDay')}</h2>
          <div className="dates">
            {days.map((d) => (
              <button type="button" key={d.date} className="dt" disabled={d.disabled} aria-pressed={form.date === d.date} onClick={() => setForm({ ...form, date: d.date, time: '' })}>
                <small>{dayFmt(d.date, { weekday: 'short' })}</small><b>{Number(d.date.slice(8))}</b><small>{dayFmt(d.date, { month: 'short' })}</small>
              </button>
            ))}
          </div>
        </>
      )}

      {service && form.date && (
        <>
          <h2 style={{ fontSize: 22, fontWeight: 700, margin: '18px 0 10px' }}>{t('chooseTime')}</h2>
          {slots === null ? <p className="muted">{t('loadingSlots')}</p> : slots.length === 0 ? <p className="sf-note">{t('noSlots')}</p> : (
            <div className="times">{slots.map((s) => { const h = hhmm(s.out_time); return <button type="button" key={h} className="tm" aria-pressed={form.time === h} onClick={() => set('time', h)}>{h}</button>; })}</div>
          )}
        </>
      )}

      {service && form.date && form.time && (
        <form className="form" style={{ marginTop: 24 }} onSubmit={submit}>
          <h2 style={{ fontSize: 22, fontWeight: 700 }}>{t('yourDetails')}</h2>
          <p className="sf-note"><b style={{ color: 'var(--fg)' }}>{tt('summary', { service: service.name, date: dayFmt(form.date, { weekday: 'long', day: 'numeric', month: 'long' }), time: form.time })}</b><br />{service.price_minor ? money(service.price_minor) : t('free')}</p>
          <div className="field"><label htmlFor="bk-name">{t('name')}</label><input id="bk-name" className="input" autoComplete="name" value={form.name} onChange={(e) => set('name', e.target.value)} /></div>
          <div className="field"><label htmlFor="bk-phone">{t('phone')}</label><input id="bk-phone" className="input" type="tel" inputMode="tel" autoComplete="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} /></div>
          <div className="field"><label htmlFor="bk-note">{t('note')}</label><input id="bk-note" className="input" maxLength={300} value={form.note} onChange={(e) => set('note', e.target.value)} /></div>
          {errText && <p className="err" role="alert">{errText}</p>}
          <button className="btn block" type="submit" disabled={busy}>{busy ? t('submitting') : p.autoConfirm ? t('submit') : t('submitPending')}</button>
        </form>
      )}
      {(!service || !form.date || !form.time) && errText && <p className="err" role="alert" style={{ marginTop: 12 }}>{errText}</p>}
    </div>
  );
}
