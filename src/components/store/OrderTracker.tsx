'use client';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import { formatMoney } from '@/lib/money';
import { FLOW, isActive } from '@/lib/order';
import type { TrackData } from '@/lib/types';

/** Acompanhamento para o cliente: atualiza sozinho enquanto o pedido está ativo. */
export function OrderTracker({ token, initial, moneyLocale, decimals }: { token: string; initial: TrackData; moneyLocale: string; decimals: number }) {
  const t = useTranslations('order');
  const tDyn = t as unknown as (key: string) => string;
  const [d, setD] = useState<TrackData>(initial);
  const money = (n: number) => formatMoney(n, d.currency, moneyLocale, decimals);

  useEffect(() => {
    if (!isActive(d.status)) return;
    const id = setInterval(async () => {
      const { data } = await createClient().rpc('get_order_status', { p_token: token });
      if (data) setD(data as TrackData);
    }, 8000);
    return () => clearInterval(id);
  }, [d.status, token]);

  const flow = FLOW[d.module];
  const cancelled = d.status === 'cancelled';
  const at = flow.indexOf(d.status);
  return (
    <div>
      <h1 className="page-title">{t('trackTitle', { number: d.number })}</h1>
      <p className="muted" style={{ margin: '6px 0 22px' }}>{tDyn(`status.${d.status}`)}{isActive(d.status) ? ` · ${t('trackLive')}` : ''}</p>
      {cancelled ? <p className="card sm" style={{ color: 'var(--bad)', fontWeight: 600 }}>{t('cancelledText')}</p> : (
        <ol className="steps" aria-label={t('trackTitle', { number: d.number })}>
          {flow.map((s, i) => (
            <li key={s} className={i < at ? 'done' : i === at ? 'now' : ''} aria-current={i === at ? 'step' : undefined}>
              <span className="dot2">{i < at ? '✓' : i + 1}</span><span>{tDyn(`status.${s}`)}</span>
            </li>
          ))}
        </ol>
      )}
      <h2 className="h2" style={{ fontSize: 22, margin: '28px 0 10px' }}>{t('yourItems')}</h2>
      <div className="list">
        {d.items.map((i, k) => (
          <div className="row" key={k} style={{ minHeight: 48 }}><div className="g"><strong style={{ fontWeight: 500 }}>{i.qty}× {i.name}</strong></div><span className="price">{money(i.unit_minor * i.qty)}</span></div>
        ))}
        {d.fee_minor > 0 && <div className="row" style={{ minHeight: 48 }}><div className="g"><strong style={{ fontWeight: 500 }}>{t('fee')}</strong></div><span className="price">{money(d.fee_minor)}</span></div>}
        <div className="row" style={{ minHeight: 52 }}><div className="g"><strong>{t('total')}</strong></div><span className="price" style={{ fontSize: 18 }}>{money(d.total_minor)}</span></div>
      </div>
      <p className="muted small" style={{ marginTop: 14 }}>{tDyn(`pay.${d.payment_method}`)} · {tDyn(`fulfillment.${d.fulfillment}`)}</p>
    </div>
  );
}
