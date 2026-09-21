'use client';
import { useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import { dbErrorKey } from '@/lib/errors';
import { formatMoney } from '@/lib/money';
import { fmtPhoneIntl, toE164Digits } from '@/lib/phone';
import { buildEarn, buildProgram, canRedeem, progressPct, toProgramForm, type EarnForm, type LoyaltyCustomer, type LoyaltyEvent, type LoyaltyProgram, type ProgramForm } from '@/lib/loyalty';

interface Props {
  tenant: { id: string; country: string; currency: string; decimals: number; moneyLocale: string };
  program: LoyaltyProgram;
  initialCustomers: LoyaltyCustomer[];
  canAdmin: boolean;
}
const initials = (n: string) => n.trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase();

export function LoyaltyManager({ tenant, program: initialProgram, initialCustomers, canAdmin }: Props) {
  const t = useTranslations('loyalty');
  const tt = t as unknown as (key: string, values?: Record<string, string | number>) => string;
  const [program, setProgram] = useState(initialProgram);
  const [customers, setCustomers] = useState(initialCustomers);
  const [earn, setEarn] = useState<EarnForm>({ phone: '', name: '', amount: '' });
  const [filter, setFilter] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<{ kind: 'history' | 'adjust'; c: LoyaltyCustomer } | null>(null);
  const [pf, setPf] = useState<ProgramForm>(toProgramForm(initialProgram, tenant.decimals));
  const money = (n: number) => formatMoney(n, tenant.currency, tenant.moneyLocale, tenant.decimals);

  const reload = useCallback(async () => {
    const { data } = await createClient().from('loyalty_customers').select('*').eq('tenant_id', tenant.id).order('balance', { ascending: false }).limit(300);
    if (data) setCustomers(data as LoyaltyCustomer[]);
  }, [tenant.id]);

  const say = (ok: boolean, text: string) => setMsg({ ok, text });
  const KNOWN = ['phone', 'name', 'amount', 'goal', 'reward', 'rate', 'min', 'below_minimum', 'no_points', 'no_program', 'not_enough_balance', 'forbidden', 'invalid_phone', 'invalid_name', 'tenant_not_found', 'generic'];
  const errText = (key: string) => tt(`errors.${KNOWN.includes(key) ? key : 'generic'}`); // chave desconhecida -> mensagem genérica
  const known = customers.find((c) => c.phone === toE164Digits(earn.phone, tenant.country));

  async function doEarn(e: React.FormEvent) {
    e.preventDefault(); setMsg(null);
    const b = buildEarn(earn, { tenantId: tenant.id, country: tenant.country, currency: tenant.currency, decimals: tenant.decimals, mode: program.mode, isKnown: !!known });
    if (!b.ok) return say(false, errText(b.error));
    setBusy(true);
    try {
      const { data, error } = await createClient().rpc('loyalty_earn', b.params);
      if (error) return say(false, errText(dbErrorKey(error)));
      const r = data as { ok: boolean; error?: string; name?: string; delta?: number; balance?: number; goal?: number; reward_ready?: boolean };
      if (!r.ok) return say(false, errText(r.error ?? 'generic'));
      say(true, `${tt('earned', { name: r.name ?? '', gain: tt(`unit.${program.mode}`, { n: r.delta ?? 0 }), balance: r.balance ?? 0, goal: r.goal ?? program.goal })}${r.reward_ready ? ` ${t('rewardReady')}` : ''}`);
      setEarn({ phone: '', name: '', amount: '' });
      await reload();
    } catch { say(false, errText('generic')); } finally { setBusy(false); }
  }
  async function redeem(c: LoyaltyCustomer) {
    if (!window.confirm(tt('redeemConfirm', { reward: program.reward, name: c.name, goal: program.goal }))) return;
    const { error } = await createClient().rpc('loyalty_redeem', { p_customer: c.id });
    say(!error, error ? errText(dbErrorKey(error)) : tt('redeemed', { name: c.name }));
    await reload();
  }
  async function saveProgram(e: React.FormEvent) {
    e.preventDefault(); setMsg(null);
    const r = buildProgram(pf, { currency: tenant.currency, decimals: tenant.decimals });
    if (!r.ok) return say(false, errText(r.error));
    const { data, error } = await createClient().from('loyalty_programs').update(r.value).eq('tenant_id', tenant.id).select('tenant_id');
    if (error || !data?.length) return say(false, errText('forbidden'));
    setProgram({ ...program, ...r.value }); say(true, t('saved'));
  }

  const list = customers.filter((c) => !filter.trim() || `${c.name} ${c.phone}`.toLowerCase().includes(filter.trim().toLowerCase()));
  const ready = customers.filter((c) => canRedeem(c.balance, program.goal)).length;
  const redeemed = customers.reduce((a, c) => a + c.rewards, 0);
  const mode = program.mode;

  return (
    <>
      <div className="card" style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-.025em' }}>{tt(`earn.${mode}`)}</h2>
        <p className="muted small" style={{ margin: '4px 0 14px' }}>{tt(`earnHint.${mode}`, { currency: tenant.currency, rate: Number(program.points_per_unit) })}</p>
        <form className="form" onSubmit={doEarn}>
          <div className="frow">
            <div className="field"><label htmlFor="l-phone">{t('phone')}</label><input id="l-phone" className="input" type="tel" inputMode="tel" value={earn.phone} onChange={(e) => setEarn({ ...earn, phone: e.target.value })} />
              {known && <span className="hint">{known.name} · {known.balance}/{program.goal}</span>}</div>
            {!known && <div className="field"><label htmlFor="l-name">{t('name')}</label><input id="l-name" className="input" value={earn.name} onChange={(e) => setEarn({ ...earn, name: e.target.value })} /></div>}
            <div className="field"><label htmlFor="l-amt">{tt('amount', { currency: tenant.currency })}</label><input id="l-amt" className="input" inputMode="decimal" value={earn.amount} onChange={(e) => setEarn({ ...earn, amount: e.target.value })} /></div>
          </div>
          <div><button className="btn" type="submit" disabled={busy}>{tt(`earnBtn.${mode}`)}</button></div>
        </form>
        {msg && <p className={msg.ok ? 'ok-box' : 'err'} role={msg.ok ? 'status' : 'alert'} style={{ marginTop: 14 }}>{msg.text}</p>}
      </div>

      <div className="grid c3" style={{ marginBottom: 20 }}>
        {[[t('stats.customers'), customers.length], [t('stats.ready'), ready], [t('stats.redeemed'), redeemed]].map(([k, v]) => (
          <div className="card sm" key={String(k)}><small className="muted">{k}</small><div style={{ fontSize: 32, fontWeight: 700, letterSpacing: '-.03em' }}>{v}</div></div>
        ))}
      </div>

      <div className="toolbar"><input className="input" style={{ maxWidth: 360, borderRadius: 999 }} placeholder={t('filter')} aria-label={t('filter')} value={filter} onChange={(e) => setFilter(e.target.value)} /></div>
      {list.length === 0 ? <div className="card muted">{t('empty')}</div> : (
        <div className="list">
          {list.map((c) => (
            <div className="row" key={c.id} style={{ flexWrap: 'wrap' }}>
              <span className="avatar">{initials(c.name)}</span>
              <div className="g"><strong>{c.name}</strong><small>{fmtPhoneIntl(c.phone)} · {money(c.total_minor)}</small></div>
              <div style={{ width: 110 }}><span className="small" style={{ fontWeight: 600 }}>{c.balance} / {program.goal}</span><div className="bar" style={{ marginTop: 5 }}><i style={{ width: `${progressPct(c.balance, program.goal)}%` }} /></div></div>
              <div className="r">
                {canRedeem(c.balance, program.goal) && <button className="btn sm" onClick={() => redeem(c)}>{t('redeem')}</button>}
                <button className="iconbtn" onClick={() => setDialog({ kind: 'history', c })}>{t('history')}</button>
                {canAdmin && <button className="iconbtn" onClick={() => setDialog({ kind: 'adjust', c })}>{t('adjust')}</button>}
              </div>
            </div>
          ))}
        </div>
      )}

      {canAdmin && (
        <section style={{ marginTop: 40 }}>
          <h2 className="h2" style={{ fontSize: 24, marginBottom: 12 }}>{t('program')}</h2>
          <form className="card form" onSubmit={saveProgram}>
            <div className="field"><span className="lbl">{t('mode')}</span>
              <div className="opts"><button type="button" className="opt" aria-pressed={pf.mode === 'stamps'} onClick={() => setPf({ ...pf, mode: 'stamps' })}>{t('modeStamps')}</button>
                <button type="button" className="opt" aria-pressed={pf.mode === 'points'} onClick={() => setPf({ ...pf, mode: 'points' })}>{t('modePoints')}</button></div></div>
            <div className="frow">
              <div className="field"><label htmlFor="p-goal">{tt(`goal.${pf.mode}`)}</label><input id="p-goal" className="input" inputMode="numeric" value={pf.goal} onChange={(e) => setPf({ ...pf, goal: e.target.value })} /></div>
              <div className="field"><label htmlFor="p-reward">{t('reward')}</label><input id="p-reward" className="input" maxLength={80} value={pf.reward} onChange={(e) => setPf({ ...pf, reward: e.target.value })} /></div>
              {pf.mode === 'points'
                ? <div className="field"><label htmlFor="p-rate">{tt('rate', { currency: tenant.currency })}</label><input id="p-rate" className="input" inputMode="decimal" value={pf.rate} onChange={(e) => setPf({ ...pf, rate: e.target.value })} /></div>
                : <div className="field"><label htmlFor="p-min">{tt('minPurchase', { currency: tenant.currency })}</label><input id="p-min" className="input" inputMode="decimal" value={pf.min} onChange={(e) => setPf({ ...pf, min: e.target.value })} /></div>}
            </div>
            <div className="row" style={{ padding: 0, minHeight: 0 }}><div className="g"><strong>{t('auto')}</strong><small style={{ whiteSpace: 'normal' }}>{t('autoHint')}</small></div>
              <label className="sw"><input type="checkbox" checked={pf.auto} onChange={(e) => setPf({ ...pf, auto: e.target.checked })} aria-label={t('auto')} /><i /></label></div>
            <div><button className="btn" type="submit">{t('save')}</button></div>
          </form>
        </section>
      )}

      {dialog?.kind === 'history' && <HistoryDialog c={dialog.c} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'adjust' && <AdjustDialog c={dialog.c} onClose={() => setDialog(null)} onDone={async () => { setDialog(null); say(true, t('adjusted')); await reload(); }} />}
    </>
  );
}

function HistoryDialog({ c, onClose }: { c: LoyaltyCustomer; onClose: () => void }) {
  const t = useTranslations('loyalty');
  const tt = t as unknown as (key: string) => string;
  const locale = useLocale();
  const [events, setEvents] = useState<LoyaltyEvent[] | null>(null);
  useEffect(() => {
    let live = true;
    createClient().from('loyalty_events').select('*').eq('customer_id', c.id).order('created_at', { ascending: false }).limit(40)
      .then((r) => { if (live) setEvents((r.data ?? []) as LoyaltyEvent[]); });
    return () => { live = false; };
  }, [c.id]);
  return (
    <div className="mbg" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={c.name}>
        <h2>{c.name}</h2>
        {events === null ? <p className="muted">…</p> : events.length === 0 ? <p className="muted">{t('noEvents')}</p> : (
          <div className="list">{events.map((e) => (
            <div className="row" key={e.id} style={{ minHeight: 48 }}><div className="g"><strong style={{ fontWeight: 500 }}>{tt(`kind.${e.kind}`)}</strong><small>{new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(e.created_at))}{e.note ? ` · ${e.note}` : ''}</small></div>
              {e.delta !== 0 && <span className={`badge ${e.delta > 0 ? 'ok' : 'acc'}`}>{e.delta > 0 ? '+' : ''}{e.delta}</span>}</div>
          ))}</div>
        )}
        <div style={{ marginTop: 16 }}><button className="btn gray" onClick={onClose}>{t('close')}</button></div>
      </div>
    </div>
  );
}

function AdjustDialog({ c, onClose, onDone }: { c: LoyaltyCustomer; onClose: () => void; onDone: () => void }) {
  const t = useTranslations('loyalty');
  const tt = t as unknown as (key: string, values?: Record<string, string | number>) => string;
  const [delta, setDelta] = useState('');
  const [note, setNote] = useState('');
  const [err, setErr] = useState<string | null>(null);
  async function apply(e: React.FormEvent) {
    e.preventDefault();
    const d = Number(delta);
    if (!Number.isInteger(d) || d === 0) return setErr('amount');
    const { error } = await createClient().rpc('loyalty_adjust', { p_customer: c.id, p_delta: d, p_note: note.trim() || null });
    if (error) return setErr(dbErrorKey(error));
    onDone();
  }
  return (
    <div className="mbg" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form className="modal form" style={{ maxWidth: 440 }} role="dialog" aria-modal="true" aria-label={tt('adjustTitle', { name: c.name })} onSubmit={apply}>
        <h2>{tt('adjustTitle', { name: c.name })}</h2>
        <div className="field"><label htmlFor="a-d">{t('delta')}</label><input id="a-d" className="input" inputMode="numeric" value={delta} onChange={(e) => setDelta(e.target.value)} autoFocus /></div>
        <div className="field"><label htmlFor="a-n">{t('note')}</label><input id="a-n" className="input" value={note} onChange={(e) => setNote(e.target.value)} /></div>
        {err && <p className="err" role="alert">{tt(`errors.${err}`)}</p>}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}><button type="button" className="btn gray" onClick={onClose}>{t('cancel')}</button><button className="btn" type="submit">{t('apply')}</button></div>
      </form>
    </div>
  );
}
