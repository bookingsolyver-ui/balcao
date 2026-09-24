import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link, redirect } from '@/i18n/navigation';
import { SiteHeader } from '@/components/SiteHeader';
import { ReviewForm } from '@/components/ReviewForm';
import { ConfigMissing } from '@/components/ConfigMissing';
import { getSession } from '@/lib/session';
import type { ReviewRow } from '@/lib/reviews';
import type { Membership } from '@/lib/types';

export default async function ReviewPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ t?: string }> }) {
  const { locale } = await params;
  const { t: wanted } = await searchParams;
  setRequestLocale(locale);
  const s = await getSession();
  if (!s.configured) return <ConfigMissing />;
  if (!s.user) redirect({ href: '/login', locale });
  const t = await getTranslations('review');

  const { data } = await s.supabase!.from('tenant_members').select('role, tenants(*)').eq('user_id', s.user!.id);
  const memberships = ((data ?? []) as unknown as Membership[]).filter((m) => m.tenants);
  if (memberships.length === 0) redirect({ href: '/app/onboarding', locale });
  const current = memberships.find((m) => m.tenants.slug === wanted) ?? memberships[0];
  const tenant = current.tenants;

  if (current.role !== 'owner' && current.role !== 'admin') redirect({ href: `/app?t=${tenant.slug}`, locale });

  const { data: existing } = await s.supabase!.from('reviews').select('*').eq('tenant_id', tenant.id).maybeSingle();

  return (
    <>
      <SiteHeader signedIn />
      <main className="wrap" style={{ padding: 'clamp(24px, 5vw, 56px) 0 80px', maxWidth: 640 }}>
        <Link className="link small" href={`/app?t=${tenant.slug}`}>← {t('back')}</Link>
        <h1 className="page-title" style={{ marginTop: 10, marginBottom: 26 }}>{t('pageTitle')}</h1>
        <ReviewForm tenantId={tenant.id} tenantName={tenant.name} existing={existing as ReviewRow | null} />
      </main>
    </>
  );
}
