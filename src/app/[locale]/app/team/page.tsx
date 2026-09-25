import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link, redirect } from '@/i18n/navigation';
import { SiteHeader } from '@/components/SiteHeader';
import { TeamInvites } from '@/components/TeamInvites';
import { ConfigMissing } from '@/components/ConfigMissing';
import { getSession } from '@/lib/session';
import type { Membership } from '@/lib/types';

export default async function TeamPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ t?: string }> }) {
  const { locale } = await params;
  const { t: wanted } = await searchParams;
  setRequestLocale(locale);
  const s = await getSession();
  if (!s.configured) return <ConfigMissing />;
  if (!s.user) redirect({ href: '/login', locale });
  const t = await getTranslations('team');

  const { data } = await s.supabase!.from('tenant_members').select('role, tenants(*)').eq('user_id', s.user!.id);
  const memberships = ((data ?? []) as unknown as Membership[]).filter((m) => m.tenants);
  if (memberships.length === 0) redirect({ href: '/app/onboarding', locale });
  const current = memberships.find((m) => m.tenants.slug === wanted) ?? memberships[0];
  const tenant = current.tenants;
  if (current.role !== 'owner' && current.role !== 'admin') redirect({ href: `/app?t=${tenant.slug}`, locale });

  const [{ data: staff }, { data: invites }] = await Promise.all([
    s.supabase!.from('staff').select('id, name, user_id').eq('tenant_id', tenant.id).eq('active', true).order('name'),
    s.supabase!.from('tenant_invites').select('id, code, role, staff_id, expires_at').eq('tenant_id', tenant.id).is('used_at', null).order('created_at', { ascending: false }),
  ]);
  const staffRows = staff ?? [];

  return (
    <>
      <SiteHeader signedIn />
      <main className="wrap" style={{ padding: 'clamp(24px, 5vw, 56px) 0 80px', maxWidth: 680 }}>
        <Link className="link small" href={`/app?t=${tenant.slug}`}>← {t('back')}</Link>
        <h1 className="page-title" style={{ marginTop: 10, marginBottom: 26 }}>{t('pageTitle')}</h1>
        <TeamInvites
          tenantId={tenant.id}
          staff={staffRows.map((s) => ({ id: s.id as string, name: s.name as string }))}
          linkedStaffIds={staffRows.filter((s) => s.user_id).map((s) => s.id as string)}
          initialInvites={(invites ?? []) as never}
        />
      </main>
    </>
  );
}
