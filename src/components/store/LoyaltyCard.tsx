'use client';
import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import { dbErrorKey } from '@/lib/errors';
import { toE164Digits } from '@/lib/phone';
import { progressPct, type LoyaltyCardData } from '@/lib/loyalty';

interface Props {
  slug: string; tenantName: string; country: string; currency: string;
  program: { mode: 'stamps' | 'points'; goal: number; reward: string; points_per_unit: number };
  /** Só para testes/SSR: mostra já um cartão. */
  initialCard?: LoyaltyCardData;
}
const CUSTOMER_KEY = 'balcao:customer';

export function LoyaltyCard({ slug, tenantName, country, currency, program, initialCard }: Props) {
  const t = useTranslations('loyalty');
  const ts = useTranslations('store');
  const tt = t as unknown as (key: string, values?: Record<string, string | number>) => string;
  const tsd = ts as unknown as (key: string, values?: Record<string, string | number>) => string;
  const locale = useLocale();
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [card, setCard] = useState<LoyaltyCardData | null>(initialCard ?? null);
  const [needsJoin, setNeedsJoin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    try { const s = JSON.parse(localStorage.getItem(CUSTOMER_KEY) ?? 'null') as { name?: string; phone?: string } | null; if (s) { setPhone(s.phone ?? ''); setName(s.name ?? ''); } } catch { /* sem dados */ }
  }, []);

  const digits = () => toE164Digits(phone, country);
  const fail = (k: string) => setErr(['phone', 'name', 'invalid_phone', 'invalid_name', 'tenant_not_found', 'no_program', 'generic'].includes(k) ? k : 'generic');
  const remember = (n?: string) => { try { localStorage.setItem(CUSTOMER_KEY, JSON.stringify({ name: n ?? name, phone })); } catch { /* ok */ } };

  async function lookup(e: React.FormEvent) {
    e.preventDefault(); setErr(null);
    const d = digits(); if (!d) return fail('phone');
    setBusy(true);
    try {
      const { data, error } = await createClient().rpc('loyalty_card', { p_slug: slug, p_phone: d });
      if (error) return fail(dbErrorKey(error));
      const c = data as LoyaltyCardData;
      if (c.found) { setCard(c); setNeedsJoin(false); remember(); } else setNeedsJoin(true);
    } catch { fail('generic'); } finally { setBusy(false); }
  }
  async function join(e: React.FormEvent) {
    e.preventDefault(); setErr(null);
    const d = digits(); if (!d) return fail('phone');
    if (name.trim().length < 2) return fail('name');
    setBusy(true);
    try {
      const { data, error } = await createClient().rpc('loyalty_join', { p_slug: slug, p_name: name.trim(), p_phone: d });
      if (error) return fail(dbErrorKey(error));
      setCard(data as LoyaltyCardData); setNeedsJoin(false); remember(name.trim());
    } catch { fail('generic'); } finally { setBusy(false); }
  }
  const leave = () => { setCard(null); setNeedsJoin(false); setPhone(''); try { localStorage.removeItem(CUSTOMER_KEY); } catch { /* ok */ } };

  const intro = program.mode === 'stamps'
    ? tsd('loyaltyStamps', { goal: program.goal, reward: program.reward })
    : tsd('loyaltyPoints', { goal: program.goal, reward: program.reward, currency, rate: Number(program.points_per_unit) });

  if (card?.found) {
    const goal = card.goal, bal = card.balance ?? 0, ready = bal >= goal;
    const stamps = card.mode === 'stamps' && goal <= 12;
    return (
      <div>
        <div className="pass">
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, position: 'relative', zIndex: 1 }}>
            <div><b style={{ fontSize: 18 }}>{tenantName}</b><div style={{ opacity: .8, fontSize: 12 }}>{t('card.title')}</div></div>
            <b>{tt('card.hello', { name: card.first_name ?? '' })}</b>
          </div>
          {stamps ? (
            <div className="stamps">{Array.from({ length: goal }, (_, k) => <div key={k} className={`stamp ${k < Math.min(bal, goal) ? 'on' : ''} ${k === goal - 1 && bal < goal ? 'gift' : ''}`}>{k < Math.min(bal, goal) ? '✓' : k === goal - 1 ? '★' : ''}</div>)}</div>
          ) : (
            <div className="bar" role="progressbar" aria-valuenow={bal} aria-valuemax={goal}><i style={{ width: `${progressPct(bal, goal)}%` }} /></div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', position: 'relative', zIndex: 1, fontSize: 14 }}>
            <span>{ready ? t('rewardReady') : tt('card.remaining', { left: tt(`unit.${card.mode}`, { n: Math.max(0, goal - bal) }) })}</span><b>{bal} / {goal}</b>
          </div>
        </div>
        {ready ? <p className="ready-box">{tt('card.ready', { reward: card.reward })}</p> : <p className="muted small" style={{ marginTop: 14 }}>{tt('card.reward', { reward: card.reward })}</p>}
        {(card.history?.length ?? 0) > 0 && (
          <>
            <h3 style={{ fontSize: 20, fontWeight: 700, margin: '22px 0 8px' }}>{t('card.activity')}</h3>
            <div className="list">{card.history!.map((h, i) => (
              <div className="row" key={i} style={{ minHeight: 46 }}><div className="g"><strong style={{ fontWeight: 500 }}>{tt(`kind.${h.kind}`)}</strong><small>{new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(h.at))}</small></div>
                {h.delta !== 0 && <span className={`badge ${h.delta > 0 ? 'ok' : 'acc'}`}>{h.delta > 0 ? '+' : ''}{h.delta}</span>}</div>
            ))}</div>
          </>
        )}
        <p className="muted small" style={{ marginTop: 14 }}>{t('card.privacy')} <button className="link small" onClick={leave}>{t('card.leave')}</button></p>
      </div>
    );
  }

  return (
    <div className="card">
      <h2 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-.025em' }}>{t('card.title')}</h2>
      <p className="muted" style={{ margin: '6px 0 4px' }}>{intro}</p>
      <p className="muted small" style={{ marginBottom: 16 }}>{t('card.enterPhone')}</p>
      <form className="form" onSubmit={needsJoin ? join : lookup}>
        <div className="field"><label htmlFor="lc-phone">{t('card.phone')}</label><input id="lc-phone" className="input" type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => { setPhone(e.target.value); setNeedsJoin(false); }} /></div>
        {needsJoin && (<>
          <p className="sf-note">{t('card.notFound')}</p>
          <div className="field"><label htmlFor="lc-name">{t('card.name')}</label><input id="lc-name" className="input" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} /></div>
        </>)}
        {err && <p className="err" role="alert">{tt(`errors.${err}`)}</p>}
        <button className="btn block" type="submit" disabled={busy}>{busy ? t('card.checking') : needsJoin ? t('card.join') : t('card.show')}</button>
      </form>
    </div>
  );
}
