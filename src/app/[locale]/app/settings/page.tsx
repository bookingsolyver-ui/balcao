import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link, redirect } from '@/i18n/navigation';
import { SiteHeader } from '@/components/SiteHeader';
import { SettingsForm } from '@/components/SettingsForm';
import { ConfigMissing } from '@/components/ConfigMissing';
import { getSession } from '@/lib/session';
import { COUNTRIES, countryName, currencyName } from '@/lib/countries';
import type { HoursRow } from '@/lib/settings';
import type { Membership } from '@/lib/types';

export default async function SettingsPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ t?: string }> }) {
  const { locale } = await params;
  const { t: wanted } = await searchParams;
  setRequestLocale(locale);
  const s = await getSession();
  if (!s.configured) return <ConfigMissing />;
  if (!s.user) redirect({ href: '/login', locale });
  const t = await getTranslations('settings');

  const { data } = await s.supabase!.from('tenant_members').select('role, tenants(*)').eq('user_id', s.user!.id);
  const memberships = ((data ?? []) as unknown as Membership[]).filter((m) => m.tenants);
  if (memberships.length === 0) redirect({ href: '/app/onboarding', locale });
  const current = memberships.find((m) => m.tenants.slug === wanted) ?? memberships[0];
  const tenant = current.tenants;

  const { data: hours } = await s.supabase!.from('business_hours').select('weekday,is_open,opens,closes').eq('tenant_id', tenant.id).order('weekday');

  return (
    <>
      <SiteHeader signedIn />
      <main className="wrap" style={{ padding: 'clamp(24px, 5vw, 56px) 0 80px', maxWidth: 820 }}>
        <Link className="link small" href={`/app?t=${tenant.slug}`}>← {t('back')}</Link>
        <h1 className="page-title" style={{ marginTop: 10 }}>{t('title')}</h1>
        <p className="muted" style={{ margin: '6px 0 26px' }}>{tenant.name}</p>
        <SettingsForm
          tenant={{ id: tenant.id, name: tenant.name, address: tenant.address, whatsapp: tenant.whatsapp, country: tenant.country, timezone: tenant.timezone, locale: tenant.locale, currency: tenant.currency, decimals: tenant.currency_decimals, is_published: tenant.is_published, modules: tenant.modules, settings: tenant.settings, logo_path: tenant.logo_path, cover_path: tenant.cover_path }}
          hours={(hours ?? []) as HoursRow[]}
          canEdit={current.role === 'owner' || current.role === 'admin'}
          countries={COUNTRIES.map((c) => ({ code: c.code, name: countryName(c.code, locale) })).sort((a, b) => a.name.localeCompare(b.name, locale))}
          timezones={[...new Set(COUNTRIES.map((c) => c.timezone))].sort()}
          currencyName={currencyName(tenant.currency, locale)}
        />
      </main>
    </>
  );
}
