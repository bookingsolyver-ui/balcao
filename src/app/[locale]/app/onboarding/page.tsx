import { getTranslations, setRequestLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { SiteHeader } from '@/components/SiteHeader';
import { OnboardingForm } from '@/components/OnboardingForm';
import { ConfigMissing } from '@/components/ConfigMissing';
import { getSession } from '@/lib/session';
import { COUNTRIES, CURRENCIES, countryName, currencyName } from '@/lib/countries';
import type { NichePreset } from '@/lib/types';

const DEFAULT_COUNTRY: Record<string, string> = { 'pt-PT': 'PT', 'pt-BR': 'BR', es: 'ES', en: 'GB' };

export default async function Onboarding({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const s = await getSession();
  if (!s.configured) return <ConfigMissing />;
  if (!s.user) redirect({ href: '/login', locale });
  const t = await getTranslations('onboarding');

  const { data } = await s.supabase!.from('niche_presets').select('niche,label,modules');
  const order = ['restaurant', 'salon', 'beauty_store', 'general'];
  const lang = locale.split('-')[0];
  const niches = ((data ?? []) as NichePreset[])
    .sort((a, b) => order.indexOf(a.niche) - order.indexOf(b.niche))
    .map((n) => ({ niche: n.niche, label: n.label[locale] ?? n.label[lang] ?? n.label.en ?? n.niche, modules: n.modules }));

  return (
    <>
      <SiteHeader signedIn />
      <main className="wrap" style={{ padding: 'clamp(28px, 6vw, 64px) 0' }}>
        <div style={{ maxWidth: 560, margin: '0 auto' }}>
          <h1 className="page-title">{t('title')}</h1>
          <p className="muted" style={{ margin: '8px 0 24px' }}>{t('subtitle')}</p>
          <div className="card">
            <OnboardingForm
              niches={niches}
              countries={COUNTRIES.map((c) => ({ code: c.code, name: countryName(c.code, locale) })).sort((a, b) => a.name.localeCompare(b.name, locale))}
              currencies={CURRENCIES.map((c) => ({ code: c, name: currencyName(c, locale) }))}
              timezones={[...new Set(COUNTRIES.map((c) => c.timezone))].sort()}
              defaultCountry={DEFAULT_COUNTRY[locale] ?? 'PT'}
            />
          </div>
        </div>
      </main>
    </>
  );
}
