'use client';
import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import { useRefresh } from '@/lib/useRefresh';
import { COUNTRIES, countryInfo } from '@/lib/countries';
import { FULFILLMENTS, PAY_METHODS, orderConfig, type OrderModule } from '@/lib/order';
import { suggestedPayments } from '@/lib/payments';
import { buildBusinessPatch, buildOrderSettings, mergeSettings, toOrderSettingsForm, validateHours, type HoursRow, type OrderSettingsForm } from '@/lib/settings';
import { buildPaymentDetails, mergePaymentDetails, paymentDetails, toPaymentDetailsForm, type PaymentDetailsForm } from '@/lib/settings';
import { agendaConfig, buildAgendaSettings, mergeAgenda, toAgendaSettingsForm, type AgendaSettingsForm } from '@/lib/booking';
import { buildMovingSettings, mergeMoving, movingConfig, toMovingSettingsForm, type MovingSettingsForm } from '@/lib/moving';
import { StoreMediaForm } from './StoreMediaForm';
import type { ModuleId } from '@/lib/types';

interface Props {
  tenant: { id: string; name: string; address: string | null; whatsapp: string | null; country: string; timezone: string; locale: string; currency: string; decimals: number; is_published: boolean; modules: Record<ModuleId, boolean>; settings: Record<string, unknown>; logo_path: string | null; cover_path: string | null };
  hours: HoursRow[];
  canEdit: boolean;
  countries: { code: string; name: string }[];
  timezones: string[];
  currencyName: string;
}
const LANGS = [['pt-PT', 'Português (PT)'], ['pt-BR', 'Português (BR)'], ['en', 'English'], ['es', 'Español']] as const;
const ORDER_MODULES: OrderModule[] = ['menu', 'catalog'];
const MODULES: ModuleId[] = ['menu', 'agenda', 'catalog', 'loyalty', 'moving'];
const WEEK = [1, 2, 3, 4, 5, 6, 0];
const hm = (t: string) => t.slice(0, 5);

export function SettingsForm({ tenant, hours, canEdit, countries, timezones, currencyName }: Props) {
  const t = useTranslations('settings');
  const to = useTranslations('order');
  const td = useTranslations('dashboard');
  const tt = t as unknown as (key: string, values?: Record<string, string | number>) => string;
  const tp = to as unknown as (key: string) => string;
  const tm = td as unknown as (key: string) => string;
  const locale = useLocale();
  const refresh = useRefresh();

  const [biz, setBiz] = useState({ name: tenant.name, address: tenant.address ?? '', whatsapp: tenant.whatsapp ? `+${tenant.whatsapp}` : '', country: tenant.country, timezone: tenant.timezone, locale: tenant.locale, is_published: tenant.is_published });
  const [modules, setModules] = useState(tenant.modules);
  const [forms, setForms] = useState<Record<OrderModule, OrderSettingsForm>>({
    menu: toOrderSettingsForm(orderConfig(tenant.settings, 'menu'), tenant.decimals),
    catalog: toOrderSettingsForm(orderConfig(tenant.settings, 'catalog'), tenant.decimals),
  });
  const [ag, setAg] = useState<AgendaSettingsForm>(toAgendaSettingsForm(agendaConfig(tenant.settings)));
  const [pd, setPd] = useState<PaymentDetailsForm>(toPaymentDetailsForm(paymentDetails(tenant.settings)));
  const [mv, setMv] = useState<MovingSettingsForm>(toMovingSettingsForm(movingConfig(tenant.settings), tenant.decimals));
  const [rows, setRows] = useState<HoursRow[]>(WEEK.map((w) => {
    const r = hours.find((h) => h.weekday === w);
    return { weekday: w, is_open: r?.is_open ?? false, opens: r ? hm(r.opens) : '09:00', closes: r ? hm(r.closes) : '18:00' };
  }));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; key: string } | null>(null);
  const tzList = timezones.includes(biz.timezone) ? timezones : [biz.timezone, ...timezones];
  const dayName = (d: number) => { const s = new Intl.DateTimeFormat(locale, { weekday: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2023, 0, 1 + d))); return s.charAt(0).toUpperCase() + s.slice(1); };
  const fail = (key: string) => setMsg({ ok: false, key });
  const setForm = (m: OrderModule, patch: Partial<OrderSettingsForm>) => setForms((f) => ({ ...f, [m]: { ...f[m], ...patch } }));
  const togglePay = (m: OrderModule, p: string) => setForm(m, { payments: forms[m].payments.includes(p) ? forms[m].payments.filter((x) => x !== p) : [...forms[m].payments, p] });

  function onCountry(code: string) {
    const c = countryInfo(code);
    setBiz((b) => ({ ...b, country: code, timezone: c?.timezone ?? b.timezone, locale: c?.locale ?? b.locale }));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    const bp = buildBusinessPatch(biz);
    if (!bp.ok) return fail(`errors.${bp.error}`);
    let settings = tenant.settings;
    for (const m of ORDER_MODULES) {
      if (!modules[m]) continue;
      const r = buildOrderSettings(forms[m], { currency: tenant.currency, decimals: tenant.decimals, module: m });
      if (!r.ok) return fail(`errors.${r.error}`);
      settings = mergeSettings(settings, m, r.value);
    }
    if (modules.agenda) {
      const a = buildAgendaSettings(ag);
      if (!a.ok) return fail(`errAgenda.${a.error}`);
      settings = mergeAgenda(settings, a.value);
    }
    if (modules.moving) {
      const mvr = buildMovingSettings(mv, { currency: tenant.currency, decimals: tenant.decimals });
      if (!mvr.ok) return fail(`moving.errors.${mvr.error}`);
      settings = mergeMoving(settings, mvr.value);
    }
    if (modules.menu || modules.catalog) {
      const pdr = buildPaymentDetails(pd, biz.country);
      if (!pdr.ok) return fail(`errors.${pdr.error}`);
      settings = mergePaymentDetails(settings, pdr.value);
    }
    if (!validateHours(rows).ok) return fail('errors.hours');
    setBusy(true);
    try {
      const sb = createClient();
      const up = await sb.from('tenants').update({ ...bp.patch, modules, settings }).eq('id', tenant.id).select('id');
      if (up.error) return fail(up.error.code === '42501' ? 'errors.forbidden' : 'errors.generic');
      if (!up.data || up.data.length === 0) return fail('errors.forbidden'); // RLS: sem permissão não altera nenhuma linha
      const hr = await sb.from('business_hours').upsert(rows.map((r) => ({ tenant_id: tenant.id, weekday: r.weekday, is_open: r.is_open, opens: r.opens, closes: r.closes })), { onConflict: 'tenant_id,weekday' });
      if (hr.error) return fail('errors.generic');
      setMsg({ ok: true, key: 'saved' });
      refresh();
    } catch { fail('errors.generic'); } finally { setBusy(false); }
  }

  const dis = !canEdit;
  const sw = (checked: boolean, onChange: (v: boolean) => void, label: string) => (
    <label className="sw" title={label}><input type="checkbox" checked={checked} disabled={dis} onChange={(e) => onChange(e.target.checked)} aria-label={label} /><i /></label>
  );

  return (
    <form onSubmit={save} className="form" style={{ gap: 28 }}>
      {dis && <p className="card sm muted">{t('viewOnly')}</p>}

      <section>
        <h2 className="h2" style={{ fontSize: 24, marginBottom: 12 }}>{t('business')}</h2>
        <div className="card form">
          <div className="field"><label htmlFor="s-name">{t('name')}</label><input id="s-name" className="input" disabled={dis} value={biz.name} onChange={(e) => setBiz({ ...biz, name: e.target.value })} /></div>
          <div className="field"><label htmlFor="s-addr">{t('address')}</label><input id="s-addr" className="input" disabled={dis} value={biz.address} onChange={(e) => setBiz({ ...biz, address: e.target.value })} /></div>
          <div className="field"><label htmlFor="s-wa">{t('whatsapp')}</label><input id="s-wa" className="input" type="tel" inputMode="tel" disabled={dis} value={biz.whatsapp} onChange={(e) => setBiz({ ...biz, whatsapp: e.target.value })} /><span className="hint">{t('whatsappHint')}</span></div>
          <div className="frow">
            <div className="field"><label htmlFor="s-country">{t('country')}</label>
              <select id="s-country" className="input" disabled={dis} value={biz.country} onChange={(e) => onCountry(e.target.value)}>{countries.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}</select></div>
            <div className="field"><label htmlFor="s-tz">{t('timezone')}</label>
              <select id="s-tz" className="input" disabled={dis} value={biz.timezone} onChange={(e) => setBiz({ ...biz, timezone: e.target.value })}>{tzList.map((z) => <option key={z} value={z}>{z.replace(/_/g, ' ')}</option>)}</select></div>
            <div className="field"><label htmlFor="s-lang">{t('language')}</label>
              <select id="s-lang" className="input" disabled={dis} value={biz.locale} onChange={(e) => setBiz({ ...biz, locale: e.target.value })}>{LANGS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
          </div>
          <span className="hint">{t('countryHint')}</span>
          <div className="row" style={{ padding: 0, minHeight: 0 }}><div className="g"><strong>{t('published')}</strong><small style={{ whiteSpace: 'normal' }}>{t('publishedHint')}</small></div>{sw(biz.is_published, (v) => setBiz({ ...biz, is_published: v }), t('published'))}</div>
          <div className="field"><span className="lbl">{t('currency')}</span><span>{tenant.currency} · {currencyName}</span><span className="hint">{t('currencyNote', { currency: tenant.currency })}</span></div>
        </div>
      </section>

      <section>
        <h2 className="h2" style={{ fontSize: 24, marginBottom: 12 }}>{t('modules')}</h2>
        <div className="list">
          {MODULES.map((m) => (
            <div className="row" key={m}><div className="g"><strong>{tm(`moduleNames.${m}`)}</strong><small style={{ whiteSpace: 'normal' }}>{tm(`moduleDesc.${m}`)}</small></div>
              {sw(modules[m], (v) => setModules({ ...modules, [m]: v }), tm(`moduleNames.${m}`))}</div>
          ))}
        </div>
      </section>

      <StoreMediaForm tenantId={tenant.id} logoPath={tenant.logo_path} coverPath={tenant.cover_path} canEdit={canEdit} />

      {ORDER_MODULES.filter((m) => modules[m]).map((m) => {
        const f = forms[m];
        const sug = suggestedPayments(biz.country);
        return (
          <section key={m}>
            <h2 className="h2" style={{ fontSize: 24, marginBottom: 12 }}>{t('orders')} · {tm(`moduleNames.${m}`)}</h2>
            <div className="card form">
              <div className="field"><span className="lbl">{t('receive')}</span>
                <div className="opts">{FULFILLMENTS.filter((x) => m === 'menu' || x !== 'dine_in').map((x) => (
                  <button type="button" key={x} className="opt" disabled={dis} aria-pressed={f[x]} onClick={() => setForm(m, { [x]: !f[x] })}>{tp(`fulfillment.${x}`)}</button>
                ))}</div></div>
              <div className="frow">
                <div className="field"><label htmlFor={`fee-${m}`}>{t('fee', { currency: tenant.currency })}</label><input id={`fee-${m}`} className="input" inputMode="decimal" disabled={dis} value={f.fee} onChange={(e) => setForm(m, { fee: e.target.value })} /></div>
                <div className="field"><label htmlFor={`min-${m}`}>{t('min', { currency: tenant.currency })}</label><input id={`min-${m}`} className="input" inputMode="decimal" disabled={dis} value={f.min} onChange={(e) => setForm(m, { min: e.target.value })} /></div>
                <div className="field"><label htmlFor={`eta-${m}`}>{t('eta')}</label><input id={`eta-${m}`} className="input" maxLength={60} disabled={dis} value={f.eta} onChange={(e) => setForm(m, { eta: e.target.value })} /></div>
              </div>
              <div className="row" style={{ padding: 0, minHeight: 0 }}><div className="g"><strong>{t('onlyWhenOpen')}</strong><small style={{ whiteSpace: 'normal' }}>{t('onlyWhenOpenHint')}</small></div>{sw(f.only_when_open, (v) => setForm(m, { only_when_open: v }), t('onlyWhenOpen'))}</div>
              <div className="field"><span className="lbl">{t('payments')}</span>
                <div className="opts">{PAY_METHODS.map((p) => <button type="button" key={p} className="opt" disabled={dis} aria-pressed={f.payments.includes(p)} onClick={() => togglePay(m, p)}>{tp(`pay.${p}`)}</button>)}</div>
                <span className="hint">{t('paymentsHint')}</span>
                {canEdit && <button type="button" className="link small" style={{ textAlign: 'left' }} onClick={() => setForm(m, { payments: [...sug] })}>{t('suggest', { country: countries.find((c) => c.code === biz.country)?.name ?? biz.country, methods: sug.map((p) => tp(`pay.${p}`)).join(', ') })}</button>}</div>
            </div>
          </section>
        );
      })}

      {(modules.menu || modules.catalog) && (
        <section>
          <h2 className="h2" style={{ fontSize: 24, marginBottom: 12 }}>{t('paymentDetails')}</h2>
          <p className="muted small" style={{ margin: '-6px 0 12px' }}>{t('paymentDetailsHint')}</p>
          <div className="card form">
            <div className="frow">
              <div className="field"><label htmlFor="pd-express">{t('expressNumber')}</label><input id="pd-express" className="input" type="tel" inputMode="tel" disabled={dis} value={pd.expressNumber} onChange={(e) => setPd({ ...pd, expressNumber: e.target.value })} /></div>
              <div className="field"><label htmlFor="pd-express-holder">{t('expressHolder')}</label><input id="pd-express-holder" className="input" maxLength={80} disabled={dis} value={pd.expressHolder} onChange={(e) => setPd({ ...pd, expressHolder: e.target.value })} /></div>
            </div>
            <div className="hr" />
            <div className="frow">
              <div className="field"><label htmlFor="pd-iban">{t('iban')}</label><input id="pd-iban" className="input" disabled={dis} value={pd.iban} onChange={(e) => setPd({ ...pd, iban: e.target.value })} /></div>
              <div className="field"><label htmlFor="pd-iban-holder">{t('ibanHolder')}</label><input id="pd-iban-holder" className="input" maxLength={80} disabled={dis} value={pd.ibanHolder} onChange={(e) => setPd({ ...pd, ibanHolder: e.target.value })} /></div>
            </div>
          </div>
        </section>
      )}

      {modules.agenda && (
        <section>
          <h2 className="h2" style={{ fontSize: 24, marginBottom: 12 }}>{t('agendaTitle')}</h2>
          <div className="card form">
            <div className="frow">
              <div className="field"><label htmlFor="ag-step">{t('agendaStep')}</label><input id="ag-step" className="input" inputMode="numeric" disabled={dis} value={ag.slot_step_min} onChange={(e) => setAg({ ...ag, slot_step_min: e.target.value })} /></div>
              <div className="field"><label htmlFor="ag-ahead">{t('agendaAhead')}</label><input id="ag-ahead" className="input" inputMode="numeric" disabled={dis} value={ag.days_ahead} onChange={(e) => setAg({ ...ag, days_ahead: e.target.value })} /></div>
              <div className="field"><label htmlFor="ag-notice">{t('agendaNotice')}</label><input id="ag-notice" className="input" inputMode="numeric" disabled={dis} value={ag.min_notice_hours} onChange={(e) => setAg({ ...ag, min_notice_hours: e.target.value })} /></div>
            </div>
            <div className="row" style={{ padding: 0, minHeight: 0 }}><div className="g"><strong>{t('agendaAuto')}</strong><small style={{ whiteSpace: 'normal' }}>{t('agendaAutoHint')}</small></div>{sw(ag.auto_confirm, (v) => setAg({ ...ag, auto_confirm: v }), t('agendaAuto'))}</div>
          </div>
        </section>
      )}

      {modules.moving && (
        <section>
          <h2 className="h2" style={{ fontSize: 24, marginBottom: 12 }}>{t('moving.title')}</h2>
          <div className="card form">
            <div className="field"><label htmlFor="mv-cap">{t('moving.capacity')}</label><input id="mv-cap" className="input" inputMode="numeric" style={{ maxWidth: 140 }} disabled={dis} value={mv.capacity} onChange={(e) => setMv({ ...mv, capacity: e.target.value })} /></div>

            <div className="hr" />
            <div><strong>{t('moving.pricing')}</strong><p className="hint" style={{ marginTop: 4 }}>{t('moving.pricingHint')}</p></div>
            <div className="frow">
              <div className="field"><label htmlFor="mv-rate">{tt('moving.rate', { currency: tenant.currency })}</label><input id="mv-rate" className="input" inputMode="decimal" disabled={dis} value={mv.rate} onChange={(e) => setMv({ ...mv, rate: e.target.value })} /></div>
              <div className="field"><label htmlFor="mv-min">{tt('moving.min', { currency: tenant.currency })}</label><input id="mv-min" className="input" inputMode="decimal" disabled={dis} value={mv.min} onChange={(e) => setMv({ ...mv, min: e.target.value })} /></div>
              <div className="field"><label htmlFor="mv-floor">{tt('moving.perFloor', { currency: tenant.currency })}</label><input id="mv-floor" className="input" inputMode="decimal" disabled={dis} value={mv.perFloor} onChange={(e) => setMv({ ...mv, perFloor: e.target.value })} /></div>
            </div>

            <div className="hr" />
            <div className="field"><span className="lbl">{t('moving.typologies')}</span>
              {mv.typologies.map((ty, i) => (
                <div className="frow" key={i} style={{ alignItems: 'end' }}>
                  <div className="field"><label htmlFor={`mv-ty-k-${i}`}>{t('moving.typologyKey')}</label><input id={`mv-ty-k-${i}`} className="input" disabled={dis} value={ty.key} onChange={(e) => setMv({ ...mv, typologies: mv.typologies.map((x, k) => (k === i ? { ...x, key: e.target.value } : x)) })} /></div>
                  <div className="field"><label htmlFor={`mv-ty-v-${i}`}>{t('moving.typologyVolume')}</label><input id={`mv-ty-v-${i}`} className="input" inputMode="decimal" disabled={dis} value={ty.m3} onChange={(e) => setMv({ ...mv, typologies: mv.typologies.map((x, k) => (k === i ? { ...x, m3: e.target.value } : x)) })} /></div>
                  {canEdit && <button type="button" className="iconbtn bad" onClick={() => setMv({ ...mv, typologies: mv.typologies.filter((_, k) => k !== i) })}>{t('moving.remove')}</button>}
                </div>
              ))}
              {canEdit && <button type="button" className="link small" style={{ textAlign: 'left' }} onClick={() => setMv({ ...mv, typologies: [...mv.typologies, { key: '', m3: '' }] })}>+ {t('moving.addTypology')}</button>}
            </div>

            <div className="hr" />
            <div className="field"><span className="lbl">{t('moving.extrasTitle')}</span>
              {mv.extras.map((ex, i) => (
                <div className="frow" key={i} style={{ alignItems: 'end' }}>
                  <div className="field"><label htmlFor={`mv-ex-n-${i}`}>{t('moving.extraName')}</label><input id={`mv-ex-n-${i}`} className="input" disabled={dis} value={ex.name} onChange={(e) => setMv({ ...mv, extras: mv.extras.map((x, k) => (k === i ? { ...x, name: e.target.value } : x)) })} /></div>
                  <div className="field"><label htmlFor={`mv-ex-p-${i}`}>{tt('moving.extraPrice', { currency: tenant.currency })}</label><input id={`mv-ex-p-${i}`} className="input" inputMode="decimal" disabled={dis} value={ex.price} onChange={(e) => setMv({ ...mv, extras: mv.extras.map((x, k) => (k === i ? { ...x, price: e.target.value } : x)) })} /></div>
                  {canEdit && <button type="button" className="iconbtn bad" onClick={() => setMv({ ...mv, extras: mv.extras.filter((_, k) => k !== i) })}>{t('moving.remove')}</button>}
                </div>
              ))}
              {canEdit && <button type="button" className="link small" style={{ textAlign: 'left' }} onClick={() => setMv({ ...mv, extras: [...mv.extras, { name: '', price: '' }] })}>+ {t('moving.addExtra')}</button>}
            </div>

            <div className="field"><label htmlFor="mv-special">{t('moving.specialItems')}</label><input id="mv-special" className="input" disabled={dis} value={mv.special} onChange={(e) => setMv({ ...mv, special: e.target.value })} /></div>
            <div className="field"><label htmlFor="mv-crews">{t('moving.crews')}</label><input id="mv-crews" className="input" disabled={dis} value={mv.crews} onChange={(e) => setMv({ ...mv, crews: e.target.value })} /></div>
            <div className="field"><label htmlFor="mv-privacy">{t('moving.privacyUrl')}</label><input id="mv-privacy" className="input" type="url" placeholder="https://" disabled={dis} value={mv.privacy} onChange={(e) => setMv({ ...mv, privacy: e.target.value })} /></div>
          </div>
        </section>
      )}

      <section>
        <h2 className="h2" style={{ fontSize: 24, marginBottom: 12 }}>{t('hours')}</h2>
        <div className="list">
          {rows.map((r, i) => (
            <div className="row" key={r.weekday} style={{ flexWrap: 'wrap' }}>
              <div className="g" style={{ minWidth: 120 }}><strong>{dayName(r.weekday)}</strong></div>
              {r.is_open ? (
                <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input className="input" type="time" style={{ width: 116, minHeight: 38 }} disabled={dis} aria-label={t('opens')} value={r.opens} onChange={(e) => setRows(rows.map((x, k) => (k === i ? { ...x, opens: e.target.value } : x)))} />
                  <span className="muted">–</span>
                  <input className="input" type="time" style={{ width: 116, minHeight: 38 }} disabled={dis} aria-label={t('closes')} value={r.closes} onChange={(e) => setRows(rows.map((x, k) => (k === i ? { ...x, closes: e.target.value } : x)))} />
                </span>
              ) : <span className="muted">{t('closed')}</span>}
              {sw(r.is_open, (v) => setRows(rows.map((x, k) => (k === i ? { ...x, is_open: v } : x))), dayName(r.weekday))}
            </div>
          ))}
        </div>
      </section>

      {msg && <p className={msg.ok ? 'ok-box' : 'err'} role={msg.ok ? 'status' : 'alert'}>{tt(msg.key)}</p>}
      {canEdit && <div><button className="btn" type="submit" disabled={busy}>{busy ? t('saving') : t('save')}</button></div>}
    </form>
  );
}
