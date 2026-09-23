import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link, redirect } from '@/i18n/navigation';
import { SiteHeader } from '@/components/SiteHeader';
import { MovingBoard } from '@/components/MovingBoard';
import { ConfigMissing } from '@/components/ConfigMissing';
import { getSession } from '@/lib/session';
import type { MoveRow } from '@/lib/moving';
import type { Membership } from '@/lib/types';

export default async function MovingPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ t?: string }> }) {
  const { locale } = await params;
  const { t: wanted } = await searchParams;
  setRequestLocale(locale);
  const s = await getSession();
  if (!s.configured) return <ConfigMissing />;
  if (!s.user) redirect({ href: '/login', locale });
  const t = await getTranslations('moveOrders');

  const { data } = await s.supabase!.from('tenant_members').select('role, tenants(*)').eq('user_id', s.user!.id);
  const memberships = ((data ?? []) as unknown as Membership[]).filter((m) => m.tenants);
  if (memberships.length === 0) redirect({ href: '/app/onboarding', locale });
  const current = memberships.find((m) => m.tenants.slug === wanted) ?? memberships[0];
  const tenant = current.tenants;
  if (!tenant.modules.moving) redirect({ href: `/app?t=${tenant.slug}`, locale });

  const { data: rows } = await s.supabase!.from('move_requests').select('*').eq('tenant_id', tenant.id).order('created_at', { ascending: false }).limit(300);

  return (
    <>
      <SiteHeader signedIn />
      <main className="wrap" style={{ padding: 'clamp(24px, 5vw, 56px) 0 80px' }}>
        <Link className="link small" href={`/app?t=${tenant.slug}`}>← {t('back')}</Link>
        <h1 className="page-title" style={{ marginTop: 10 }}>{t('title')}</h1>
        <p className="muted" style={{ margin: '6px 0 26px' }}>{tenant.name}</p>
        <MovingBoard
          tenant={{ id: tenant.id, slug: tenant.slug, name: tenant.name, country: tenant.country, currency: tenant.currency, decimals: tenant.currency_decimals, timezone: tenant.timezone, whatsapp: tenant.whatsapp, locale: tenant.locale }}
          initialRows={(rows ?? []) as MoveRow[]} canDownload={current.role === 'owner' || current.role === 'admin'}
        />
      </main>
    </>
  );
}
