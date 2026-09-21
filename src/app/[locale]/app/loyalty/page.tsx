import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link, redirect } from '@/i18n/navigation';
import { SiteHeader } from '@/components/SiteHeader';
import { LoyaltyManager } from '@/components/LoyaltyManager';
import { ConfigMissing } from '@/components/ConfigMissing';
import { getSession } from '@/lib/session';
import { moneyLocale } from '@/lib/money';
import type { LoyaltyCustomer, LoyaltyProgram } from '@/lib/loyalty';
import type { Membership } from '@/lib/types';

export default async function LoyaltyPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ t?: string }> }) {
  const { locale } = await params;
  const { t: wanted } = await searchParams;
  setRequestLocale(locale);
  const s = await getSession();
  if (!s.configured) return <ConfigMissing />;
  if (!s.user) redirect({ href: '/login', locale });
  const t = await getTranslations('loyalty');

  const { data } = await s.supabase!.from('tenant_members').select('role, tenants(*)').eq('user_id', s.user!.id);
  const memberships = ((data ?? []) as unknown as Membership[]).filter((m) => m.tenants);
  if (memberships.length === 0) redirect({ href: '/app/onboarding', locale });
  const current = memberships.find((m) => m.tenants.slug === wanted) ?? memberships[0];
  const tenant = current.tenants;
  if (!tenant.modules.loyalty) redirect({ href: `/app?t=${tenant.slug}`, locale });

  const [{ data: program }, { data: customers }] = await Promise.all([
    s.supabase!.from('loyalty_programs').select('*').eq('tenant_id', tenant.id).maybeSingle(),
    s.supabase!.from('loyalty_customers').select('*').eq('tenant_id', tenant.id).order('balance', { ascending: false }).limit(300),
  ]);
  if (!program) redirect({ href: `/app?t=${tenant.slug}`, locale });

  return (
    <>
      <SiteHeader signedIn />
      <main className="wrap" style={{ padding: 'clamp(24px, 5vw, 56px) 0 80px', maxWidth: 860 }}>
        <Link className="link small" href={`/app?t=${tenant.slug}`}>← {t('back')}</Link>
        <h1 className="page-title" style={{ marginTop: 10 }}>{t('title')}</h1>
        <p className="muted" style={{ margin: '6px 0 26px' }}>{tenant.name}</p>
        <LoyaltyManager
          tenant={{ id: tenant.id, country: tenant.country, currency: tenant.currency, decimals: tenant.currency_decimals, moneyLocale: moneyLocale(locale, tenant.country) }}
          program={program as LoyaltyProgram}
          initialCustomers={(customers ?? []) as LoyaltyCustomer[]}
          canAdmin={current.role === 'owner' || current.role === 'admin'}
        />
      </main>
    </>
  );
}
