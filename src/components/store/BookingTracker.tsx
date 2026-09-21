'use client';
import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import { dbErrorKey } from '@/lib/errors';
import { formatMoney } from '@/lib/money';
import { calendarLink, isLiveBooking, timeInTz, type TrackBooking } from '@/lib/booking';

export function BookingTracker({ token, initial, tenant }: { token: string; initial: TrackBooking; tenant: { name: string; address: string | null; timezone: string; moneyLocale: string; currency: string; decimals: number } }) {
  const t = useTranslations('booking');
  const tt = t as unknown as (key: string) => string;
  const locale = useLocale();
  const [b, setB] = useState(initial);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const whenRaw = new Intl.DateTimeFormat(locale, { dateStyle: 'full', timeZone: tenant.timezone }).format(new Date(b.starts_at));
  const when = whenRaw.charAt(0).toUpperCase() + whenRaw.slice(1); // só a primeira letra (o CSS capitalize poria maiúscula em todas as palavras)
  const canCancel = isLiveBooking(b.status) && new Date(b.starts_at).getTime() > Date.now();

  async function cancel() {
    if (!window.confirm(t('cancelConfirm'))) return;
    const { error } = await createClient().rpc('cancel_booking', { p_token: token });
    if (error) { const k = dbErrorKey(error); setMsg({ ok: false, text: tt(`errors.${['cannot_cancel', 'not_found'].includes(k) ? k : 'generic'}`) }); return; }
    setB({ ...b, status: 'cancelled' }); setMsg({ ok: true, text: t('cancelledOk') });
  }
  return (
    <div>
      <h1 className="page-title">{t('trackTitle')}</h1>
      <div className="card" style={{ marginTop: 20 }}>
        <span className={`badge ${b.status === 'confirmed' || b.status === 'completed' ? 'ok' : b.status === 'pending' ? 'warn' : 'bad'}`}>{tt(`status.${b.status}`)}</span>
        <h2 style={{ fontSize: 24, fontWeight: 700, margin: '12px 0 4px' }}>{b.service_name}</h2>
        <p className="muted">{when} · {timeInTz(b.starts_at, tenant.timezone)}</p>
        <p className="muted small" style={{ marginTop: 6 }}>{tenant.name}{tenant.address ? ` · ${tenant.address}` : ''} · {b.staff_name}</p>
        <p style={{ marginTop: 12, fontWeight: 600 }}>{b.price_minor ? formatMoney(b.price_minor, tenant.currency, tenant.moneyLocale, tenant.decimals) : t('free')}</p>
      </div>
      {msg && <p className={msg.ok ? 'ok-box' : 'err'} role="status" style={{ marginTop: 14 }}>{msg.text}</p>}
      <div className="form" style={{ marginTop: 18 }}>
        {isLiveBooking(b.status) && <a className="btn gray block" target="_blank" rel="noopener" href={calendarLink({ title: `${b.service_name} — ${tenant.name}`, startsAt: b.starts_at, durationMin: b.duration_min, details: b.staff_name, location: tenant.address ?? undefined })}>{t('addCalendar')}</a>}
        {canCancel && <button className="btn bad block" onClick={cancel}>{t('cancelBtn')}</button>}
      </div>
    </div>
  );
}
