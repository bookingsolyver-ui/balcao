'use client';
import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import { formatMoney } from '@/lib/money';
import type { MoveTrack } from '@/lib/moving';

export function MoveTracker({ token, initial, tenant }: { token: string; initial: MoveTrack; tenant: { name: string; moneyLocale: string; decimals: number } }) {
  const t = useTranslations('move');
  const tt = t as unknown as (key: string, values?: Record<string, string | number>) => string;
  const locale = useLocale();
  const [d, setD] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const money = (n: number) => formatMoney(n, d.currency, tenant.moneyLocale, tenant.decimals);
  const dateFmt = (iso: string) => new Intl.DateTimeFormat(locale, { dateStyle: 'full', timeZone: 'UTC' }).format(new Date(iso + 'T00:00:00Z'));

  async function respond(accept: boolean) {
    setBusy(true); setMsg(null);
    const { data, error } = await createClient().rpc('respond_move_quote', { p_token: token, p_accept: accept });
    setBusy(false);
    if (error) return setMsg(t('errors.generic'));
    setD(data as MoveTrack);
  }

  return (
    <div>
      <h1 className="page-title">{tt('trackTitle', { number: d.number })}</h1>
      <p className="muted" style={{ margin: '6px 0 20px' }}><span className="badge acc">{tt(`status.${d.status}`)}</span> · {d.origin_city} → {d.dest_city} · {d.volume_m3} m³</p>

      {d.status === 'quoted' && d.quoted_minor != null && (
        <div className="quote-box">
          <div>{t('quoteReady')}</div>
          <div className="amt">{money(d.quoted_minor)}</div>
          {d.quote_note && <p style={{ opacity: .9 }}>{d.quote_note}</p>}
        </div>
      )}
      {d.status === 'quoted' && (
        <div className="form" style={{ marginTop: 18 }}>
          {msg && <p className="err" role="alert">{msg}</p>}
          <button className="btn block" disabled={busy} onClick={() => respond(true)}>{t('accept')}</button>
          <button className="btn gray block" disabled={busy} onClick={() => respond(false)}>{t('decline')}</button>
        </div>
      )}
      {d.status === 'accepted' && <p className="ok-box">{t('acceptedMsg')}</p>}
      {d.status === 'lost' && <p className="card sm muted">{t('declinedMsg')}</p>}
      {(d.status === 'new' || d.status === 'visit') && <p className="sf-note">{t('waitingQuote')}</p>}
      {d.confirmed_date && (
        <div className="card sm" style={{ marginTop: 16 }}><strong>{t('confirmedDate')}</strong><div className="muted small">{dateFmt(d.confirmed_date)}{d.confirmed_window && d.confirmed_window !== 'any' ? ` · ${tt(`window${d.confirmed_window.charAt(0).toUpperCase()}${d.confirmed_window.slice(1)}` as never)}` : ''}</div></div>
      )}
    </div>
  );
}
