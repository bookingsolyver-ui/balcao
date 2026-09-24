'use client';
import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { daysLeft, isBillingOk, trialExpired, type BillingRow } from '@/lib/billing';

interface Props { billing: BillingRow | null; tenantId: string }
declare global { interface Window { Paddle?: { Environment: { set: (e: string) => void }; Initialize: (o: { token: string }) => void; Checkout: { open: (o: { items: { priceId: string; quantity: number }[]; customData?: Record<string, string> }) => void } } } }

/** Verdadeiro só quando o negócio tem tudo configurado para receber pagamentos (as variáveis do Paddle existem). */
const paddleReady = () => Boolean(process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN && process.env.NEXT_PUBLIC_PADDLE_PRICE_ID);

export function BillingCard({ billing, tenantId }: Props) {
  const t = useTranslations('billing');
  const tt = t as unknown as (key: string, values?: Record<string, string | number>) => string;
  const locale = useLocale();
  const [scriptReady, setScriptReady] = useState(false);
  const [opening, setOpening] = useState(false);

  useEffect(() => {
    if (!paddleReady() || typeof window === 'undefined' || window.Paddle) { if (window?.Paddle) setScriptReady(true); return; }
    const s = document.createElement('script');
    s.src = 'https://cdn.paddle.com/paddle/v2/paddle.js';
    s.onload = () => {
      window.Paddle!.Environment.set(process.env.NEXT_PUBLIC_PADDLE_ENV === 'production' ? 'production' : 'sandbox');
      window.Paddle!.Initialize({ token: process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN! });
      setScriptReady(true);
    };
    document.head.appendChild(s);
  }, []);

  function openCheckout() {
    if (!window.Paddle) return;
    setOpening(true);
    window.Paddle.Checkout.open({ items: [{ priceId: process.env.NEXT_PUBLIC_PADDLE_PRICE_ID!, quantity: 1 }], customData: { tenant_id: tenantId } });
    setTimeout(() => setOpening(false), 1500); // o próprio Paddle mostra o seu overlay; isto só desliga o estado "a abrir"
  }

  const status = billing?.status ?? 'trialing';
  const expired = billing ? trialExpired(billing) : false;
  const left = billing?.trial_ends_at ? daysLeft(billing.trial_ends_at) : null;
  const ok = billing ? isBillingOk(billing.status) && !expired : true;
  const periodEnd = billing?.current_period_end ? new Intl.DateTimeFormat(locale, { dateStyle: 'long' }).format(new Date(billing.current_period_end)) : null;

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-.025em' }}>{t('title')}</h2>
        <span className={`badge ${ok && status !== 'trialing' ? 'ok' : expired || status === 'canceled' || status === 'past_due' || status === 'unpaid' ? 'bad' : ''}`}>{tt(`status.${expired ? 'expired' : status}`)}</span>
      </div>

      {status === 'trialing' && !expired && <p className="muted" style={{ margin: '8px 0 0' }}>{tt('trialLeft', { n: left ?? 0 })}</p>}
      {expired && <p style={{ margin: '8px 0 0', color: 'var(--bad)' }}>{t('trialOver')}</p>}
      {status === 'active' && periodEnd && <p className="muted" style={{ margin: '8px 0 0' }}>{tt('renewsOn', { date: periodEnd })}</p>}
      {status === 'past_due' && <p style={{ margin: '8px 0 0', color: 'var(--bad)' }}>{t('pastDue')}</p>}
      {status === 'canceled' && <p className="muted" style={{ margin: '8px 0 0' }}>{t('canceledNote')}</p>}
      {status === 'paused' && <p className="muted" style={{ margin: '8px 0 0' }}>{t('pausedNote')}</p>}
      {status === 'unpaid' && <p style={{ margin: '8px 0 0', color: 'var(--bad)' }}>{t('unpaidNote')}</p>}

      {status !== 'active' && (
        paddleReady() ? (
          <button className="btn sm" style={{ marginTop: 14 }} disabled={!scriptReady || opening} onClick={openCheckout}>{scriptReady ? t('subscribe') : t('loading')}</button>
        ) : (
          <p className="hint" style={{ marginTop: 14 }}>{t('notConfigured')}</p>
        )
      )}
    </div>
  );
}
