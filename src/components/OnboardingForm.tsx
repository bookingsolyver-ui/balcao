'use client';
import { useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { createClient } from '@/lib/supabase/client';
import { COUNTRIES, countryInfo } from '@/lib/countries';
import { decimalsFor } from '@/lib/money';
import { toE164Digits } from '@/lib/phone';
import { isValidSlug, slugify } from '@/lib/slug';
import { dbErrorKey } from '@/lib/errors';
import { suggestedPayments } from '@/lib/payments';
import type { ModuleId } from '@/lib/types';

interface Props {
  niches: { niche: string; label: string; modules: Record<ModuleId, boolean> }[];
  countries: { code: string; name: string }[];
  currencies: { code: string; name: string }[];
  timezones: string[];
  defaultCountry: string;
}

const LANGS = [['pt-PT', 'Português (PT)'], ['pt-BR', 'Português (BR)'], ['en', 'English'], ['es', 'Español']] as const;

export function OnboardingForm({ niches, countries, currencies, timezones, defaultCountry }: Props) {
  const t = useTranslations('onboarding');
  const td = useTranslations('dashboard');
  const uiLocale = useLocale();
  const router = useRouter();
  const start = countryInfo(defaultCountry) ?? COUNTRIES[0];

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [niche, setNiche] = useState(niches.find((n) => n.niche === 'restaurant')?.niche ?? niches[0]?.niche ?? 'general');
  const [country, setCountry] = useState(start.code);
  const [currency, setCurrency] = useState(start.currency);
  const [timezone, setTimezone] = useState(start.timezone);
  const [storeLocale, setStoreLocale] = useState<string>(start.locale);
  const [whatsapp, setWhatsapp] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const preset = niches.find((n) => n.niche === niche);
  const modulesOn = useMemo(() => (preset ? (Object.keys(preset.modules) as ModuleId[]).filter((m) => preset.modules[m]) : []), [preset]);

  function onCountry(code: string) {
    const c = countryInfo(code);
    setCountry(code);
    if (c) { setCurrency(c.currency); setTimezone(c.timezone); setStoreLocale(c.locale); }
  }
  function onName(v: string) { setName(v); if (!slugTouched) setSlug(slugify(v)); }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!isValidSlug(slug)) return setError('errors.invalid_slug');
    const phone = whatsapp.trim() ? toE164Digits(whatsapp, country) : null;
    if (whatsapp.trim() && !phone) return setError('whatsappInvalid');
    setBusy(true);
    try {
      const sb = createClient();
      const { data: newId, error } = await sb.rpc('create_tenant', {
        p_slug: slug, p_name: name.trim(), p_niche: niche, p_currency: currency, p_currency_decimals: decimalsFor(currency),
        p_locale: storeLocale, p_timezone: timezone, p_country: country, p_whatsapp: phone,
      });
      if (error) return setError(`errors.${dbErrorKey(error)}`);
      // o negócio já nasce com os pagamentos habituais do país (ex.: Angola → Express, transferência, pagar na loja); não bloqueia se falhar
      try {
        const { data: row } = await sb.from('tenants').select('settings').eq('id', newId as string).single();
        const settings = (row?.settings ?? {}) as Record<string, unknown>;
        const pay = suggestedPayments(country);
        const withPay = (m: string) => ({ ...((settings[m] as object) ?? {}), payments: pay });
        await sb.from('tenants').update({ settings: { ...settings, menu: withPay('menu'), catalog: withPay('catalog') } }).eq('id', newId as string);
      } catch { /* o dono pode ajustar nas Definições */ }
      router.replace('/app'); router.refresh();
    } catch { setError('errors.generic'); } finally { setBusy(false); }
  }

  const tzList = timezones.includes(timezone) ? timezones : [timezone, ...timezones];
  return (
    <form className="form" onSubmit={onSubmit}>
      <div className="field"><label htmlFor="niche">{t('niche')}</label>
        <select id="niche" className="input" value={niche} onChange={(e) => setNiche(e.target.value)}>
          {niches.map((n) => <option key={n.niche} value={n.niche}>{n.label}</option>)}
        </select>
        <span className="hint">{t('modulesOn')}: {modulesOn.map((m) => td(`moduleNames.${m}` as never)).join(' · ')}</span></div>

      <div className="field"><label htmlFor="name">{t('name')}</label>
        <input id="name" className="input" required minLength={2} maxLength={80} value={name} onChange={(e) => onName(e.target.value)} autoComplete="organization" /></div>

      <div className="field"><label htmlFor="slug">{t('slug')}</label>
        <input id="slug" className="input" required value={slug} onChange={(e) => { setSlugTouched(true); setSlug(slugify(e.target.value)); }} autoCapitalize="none" spellCheck={false} />
        <span className="hint">{t('slugHint')} /{storeLocale}/s/{slug || '…'}</span></div>

      <div className="frow">
        <div className="field"><label htmlFor="country">{t('country')}</label>
          <select id="country" className="input" value={country} onChange={(e) => onCountry(e.target.value)}>
            {countries.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
          </select></div>
        <div className="field"><label htmlFor="currency">{t('currency')}</label>
          <select id="currency" className="input" value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {currencies.map((c) => <option key={c.code} value={c.code}>{c.code} · {c.name}</option>)}
          </select>
          <span className="hint">{t('currencyHint')}</span></div>
      </div>

      <div className="frow">
        <div className="field"><label htmlFor="tz">{t('timezone')}</label>
          <select id="tz" className="input" value={timezone} onChange={(e) => setTimezone(e.target.value)}>
            {tzList.map((z) => <option key={z} value={z}>{z.replace(/_/g, ' ')}</option>)}
          </select></div>
        <div className="field"><label htmlFor="lang">{t('language')}</label>
          <select id="lang" className="input" value={storeLocale} onChange={(e) => setStoreLocale(e.target.value)}>
            {LANGS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select></div>
      </div>

      <div className="field"><label htmlFor="wa">{t('whatsapp')}</label>
        <input id="wa" className="input" type="tel" inputMode="tel" autoComplete="tel" placeholder="+351 912 345 678" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} />
        <span className="hint">{t('whatsappHint')}</span></div>

      {error && <p className="err" role="alert">{t(error as never)}</p>}
      <button className="btn block" type="submit" disabled={busy}>{busy ? t('creating') : t('submit')}</button>
      <input type="hidden" value={uiLocale} readOnly />
    </form>
  );
}
