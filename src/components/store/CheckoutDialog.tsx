'use client';
import { useEffect, useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useRefresh } from '@/lib/useRefresh';
import { paymentsFor } from '@/lib/payments';
import { createClient } from '@/lib/supabase/client';
import { dbErrorKey } from '@/lib/errors';
import { fmtPhoneIntl, waLink } from '@/lib/phone';
import { formatIban } from '@/lib/iban';
import { resolveLines } from '@/lib/cart';
import { allowedFulfillments, buildOrderParams, orderMessage, totals, unitPrice, type Fulfillment, type OrderForm } from '@/lib/order';
import { useCart } from './CartProvider';

export interface Done { number: number; total: number; token: string; text: string; payment: string }
const CUSTOMER_KEY = 'balcao:customer';

export function CheckoutDialog({ initialDone }: { /** Só para testes/SSR: mostra já o ecrã de confirmação. */ initialDone?: Done }) {
  const t = useTranslations('order');
  const locale = useLocale();
  const refresh = useRefresh();
  const { cart, module, items, info, money, add, set, clear, setOpen } = useCart();
  const mod = module!;
  const cfg = info.configs[mod];
  const fulfillments = allowedFulfillments(cfg);
  const initialFulfillment = fulfillments[0] ?? 'pickup';
  const [form, setForm] = useState<OrderForm>({ fulfillment: initialFulfillment, name: '', phone: '', address: '', table: '', payment: paymentsFor(cfg, initialFulfillment)[0] ?? 'cash', change: '', note: '' });
  // "pagar na loja" não existe em entregas: a lista muda com a forma de receber
  const payments = paymentsFor(cfg, form.fulfillment);
  const payment = payments.includes(form.payment) ? form.payment : (payments[0] ?? 'cash');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<Done | null>(initialDone ?? null);
  const [copied, setCopied] = useState(false);
  const copy = (v: string) => { navigator.clipboard?.writeText(v).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }); };
  const set_ = <K extends keyof OrderForm>(k: K, v: OrderForm[K]) => setForm((p) => ({ ...p, [k]: v }));
  const close = () => setOpen(false);

  useEffect(() => {
    try { const s = JSON.parse(localStorage.getItem(CUSTOMER_KEY) ?? 'null') as { name?: string; phone?: string } | null; if (s) setForm((p) => ({ ...p, name: s.name ?? '', phone: s.phone ?? '' })); } catch { /* sem dados guardados */ }
  }, []);
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [setOpen]);

  const lines = useMemo(() => resolveLines(cart, mod, items), [cart, mod, items]);
  const tot = totals(lines, cfg, form.fulfillment);
  const closedBlock = cfg.only_when_open === true && info.openNow === false; // a loja só aceita pedidos com o horário aberto

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (lines.length === 0) return setErr('empty_cart');
    const built = buildOrderParams({ ...form, payment }, { slug: info.slug, module: mod, country: info.country, currency: info.currency, decimals: info.decimals, lines: lines.map((l) => ({ itemId: l.item.id, qty: l.qty })) });
    if (!built.ok) return setErr(built.error);
    if (closedBlock) return setErr('store_closed');
    if (tot.missing > 0) return setErr('below_minimum');
    setBusy(true);
    try {
      const { data, error } = await createClient().rpc('place_order', built.params);
      if (error) {
        const k = dbErrorKey(error);
        setErr(k);
        if (k === 'insufficient_stock' || k === 'item_unavailable') refresh(); // atualiza stock e disponibilidade
        return;
      }
      const r = data as { number: number; total_minor: number; public_token: string };
      try { localStorage.setItem(CUSTOMER_KEY, JSON.stringify({ name: form.name.trim(), phone: form.phone.trim() })); } catch { /* ok */ }
      const text = orderMessage({
        number: r.number, business: info.name, customer: built.params.p_customer_name, phone: built.params.p_customer_phone,
        fulfillmentLabel: t(`fulfillment.${form.fulfillment}`), address: built.params.p_address, table: built.params.p_table,
        lines: lines.map((l) => ({ qty: l.qty, name: l.item.name, total: money(unitPrice(l.item) * l.qty) })),
        subtotal: money(tot.subtotal), fee: tot.fee ? money(tot.fee) : null, total: money(r.total_minor),
        paymentLabel: t(`pay.${payment}`), change: built.params.p_cash_change_minor != null ? money(built.params.p_cash_change_minor) : null, note: built.params.p_note,
        trackUrl: `${window.location.origin}/${locale}/s/${info.slug}/order/${r.public_token}`,
        labels: { order: t('wa.order'), customer: t('wa.customer'), type: t('wa.type'), subtotal: t('wa.subtotal'), delivery: t('wa.delivery'), total: t('wa.total'), payment: t('wa.payment'), changeFor: t('wa.changeFor'), note: t('wa.note'), track: t('wa.track'), table: t('wa.table') },
      });
      setDone({ number: r.number, total: r.total_minor, token: r.public_token, text, payment });
      clear();
    } catch { setErr('generic'); } finally { setBusy(false); }
  }

  const tDyn = t as unknown as (key: string, values?: Record<string, string | number>) => string; // chaves dinâmicas (errors.*)
  const errText = err ? tDyn(`errors.${err}`, { min: money(cfg.min_minor), missing: money(tot.missing) }) : null;

  return (
    <div className="mbg" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="co-title">
        {done ? (
          <div>
            <div className="done-i" aria-hidden="true">✓</div>
            <h2 id="co-title" style={{ textAlign: 'center' }}>{t('doneTitle', { number: done.number })}</h2>
            <p className="muted" style={{ textAlign: 'center', margin: '8px 0 20px' }}>{t('doneText', { business: info.name })}</p>
            <p style={{ textAlign: 'center', fontSize: 22, fontWeight: 700, marginBottom: 20 }}>{money(done.total)}</p>
            {done.payment === 'express' && info.paymentDetails?.express_number && (
              <div className="pay-box">
                <strong>{t('payExpress')}</strong>
                <div className="pb-row"><span className="pb-num">{fmtPhoneIntl(info.paymentDetails.express_number)}</span><button type="button" className="copy" onClick={() => copy(info.paymentDetails!.express_number!)}>{copied ? '✓' : t('copy')}</button></div>
                {info.paymentDetails.express_holder && <p className="muted small" style={{ marginTop: 6 }}>{t('payHolder')}: {info.paymentDetails.express_holder}</p>}
                <p className="muted small" style={{ marginTop: 6 }}>{t('payAmount')}: <strong style={{ color: 'var(--fg)' }}>{money(done.total)}</strong></p>
                <p className="muted small" style={{ marginTop: 10 }}>{t('payThenSend')}</p>
              </div>
            )}
            {done.payment === 'transfer' && info.paymentDetails?.iban && (
              <div className="pay-box">
                <strong>{t('payTransfer')}</strong>
                <div className="pb-row"><span className="pb-num">{formatIban(info.paymentDetails.iban)}</span><button type="button" className="copy" onClick={() => copy(info.paymentDetails!.iban!)}>{copied ? '✓' : t('copy')}</button></div>
                {info.paymentDetails.iban_holder && <p className="muted small" style={{ marginTop: 6 }}>{t('payHolder')}: {info.paymentDetails.iban_holder}</p>}
                <p className="muted small" style={{ marginTop: 6 }}>{t('payAmount')}: <strong style={{ color: 'var(--fg)' }}>{money(done.total)}</strong></p>
                <p className="muted small" style={{ marginTop: 10 }}>{t('payThenSend')}</p>
              </div>
            )}
            <div className="form">
              {info.whatsapp
                ? <a className="btn wa block" target="_blank" rel="noopener" href={waLink(info.whatsapp, done.text)}>{t('sendWhatsapp')}</a>
                : <p className="sf-note muted small">{t('noWhatsapp')}</p>}
              <a className="btn ghost block" href={`/${locale}/s/${info.slug}/order/${done.token}`}>{t('track')}</a>
              <button className="btn gray block" onClick={close}>{t('close')}</button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="form">
            <h2 id="co-title" style={{ marginBottom: 0 }}>{t('bag')}</h2>
            {lines.length === 0 ? <p className="muted">{t('empty')}</p> : (
              <div className="list" style={{ background: 'var(--bg2)' }}>
                {lines.map((l) => (
                  <div className="row" key={l.item.id} style={{ minHeight: 52, padding: '8px 14px' }}>
                    <span className="th" style={{ ['--s' as string]: '40px', width: 40, height: 40, fontSize: 20 }}>{l.item.emoji ?? '•'}</span>
                    <div className="g"><strong style={{ fontSize: 15 }}>{l.item.name}</strong><small>{money(unitPrice(l.item))}</small></div>
                    <span className="stepper">
                      <button type="button" aria-label={t('decAria')} onClick={() => set(l.item.id, l.qty - 1)}>−</button><b>{l.qty}</b>
                      <button type="button" aria-label={t('incAria')} onClick={() => add(l.item.id)} disabled={l.item.stock != null && l.qty >= l.item.stock}>+</button>
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div className="field"><span className="lbl">{t('fulfillmentTitle')}</span>
              <div className="opts">{fulfillments.map((f: Fulfillment) => <button type="button" key={f} className="opt" aria-pressed={form.fulfillment === f} onClick={() => set_('fulfillment', f)}>{t(`fulfillment.${f}`)}</button>)}</div>
              <span className="hint">{t('eta', { eta: cfg.eta })}</span></div>
            {form.fulfillment === 'delivery' && <div className="field"><label htmlFor="co-addr">{t('address')}</label><input id="co-addr" className="input" autoComplete="street-address" value={form.address} onChange={(e) => set_('address', e.target.value)} /></div>}
            {form.fulfillment === 'dine_in' && <div className="field"><label htmlFor="co-table">{t('table')}</label><input id="co-table" className="input" inputMode="numeric" value={form.table} onChange={(e) => set_('table', e.target.value)} /></div>}
            <div className="frow">
              <div className="field"><label htmlFor="co-name">{t('name')}</label><input id="co-name" className="input" autoComplete="name" value={form.name} onChange={(e) => set_('name', e.target.value)} /></div>
              <div className="field"><label htmlFor="co-phone">{t('phone')}</label><input id="co-phone" className="input" type="tel" inputMode="tel" autoComplete="tel" value={form.phone} onChange={(e) => set_('phone', e.target.value)} /><span className="hint">{t('phoneHint')}</span></div>
            </div>
            <div className="field"><span className="lbl">{t('paymentTitle')}</span>
              <div className="opts">{payments.map((p) => <button type="button" key={p} className="opt" aria-pressed={payment === p} onClick={() => set_('payment', p)}>{t(`pay.${p}` as never)}</button>)}</div></div>
            {payment === 'cash' && <div className="field"><label htmlFor="co-change">{t('change')}</label><input id="co-change" className="input" inputMode="decimal" value={form.change} onChange={(e) => set_('change', e.target.value)} /></div>}
            <div className="field"><label htmlFor="co-note">{t('note')}</label><input id="co-note" className="input" maxLength={300} value={form.note} onChange={(e) => set_('note', e.target.value)} /></div>

            <div className="sf-sum">
              <div><span>{t('subtotal')}</span><span>{money(tot.subtotal)}</span></div>
              {form.fulfillment === 'delivery' && <div><span>{t('fee')}</span><span>{money(tot.fee)}</span></div>}
              <div className="t"><span>{t('total')}</span><span>{money(tot.total)}</span></div>
            </div>
            {closedBlock && <p className="sf-note">{t('closedNotice', { status: info.statusText ?? '' })}</p>}
            {tot.missing > 0 && <p className="sf-note">{t('minimum', { min: money(cfg.min_minor), missing: money(tot.missing) })}</p>}
            {errText && <p className="err" role="alert">{errText}</p>}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button type="button" className="btn gray" onClick={close}>{t('close')}</button>
              <button type="submit" className="btn" style={{ flex: 1 }} disabled={busy || lines.length === 0 || closedBlock}>{busy ? t('submitting') : t('submit', { total: money(tot.total) })}</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
