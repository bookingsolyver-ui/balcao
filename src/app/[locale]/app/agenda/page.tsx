import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link, redirect } from '@/i18n/navigation';
import { SiteHeader } from '@/components/SiteHeader';
import { AgendaManager } from '@/components/AgendaManager';
import { ConfigMissing } from '@/components/ConfigMissing';
import { getSession } from '@/lib/session';
import { moneyLocale } from '@/lib/money';
import { agendaConfig, dayRangeUtc, todayInTz, type BookingRow, type HoursRow, type ServiceRow, type StaffRow } from '@/lib/booking';
import type { Membership } from '@/lib/types';

export default async function AgendaPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ t?: string }> }) {
  const { locale } = await params;
  const { t: wanted } = await searchParams;
  setRequestLocale(locale);
  const s = await getSession();
  if (!s.configured) return <ConfigMissing />;
  if (!s.user) redirect({ href: '/login', locale });
  const t = await getTranslations('agenda');

  const { data } = await s.supabase!.from('tenant_members').select('role, tenants(*)').eq('user_id', s.user!.id);
  const memberships = ((data ?? []) as unknown as Membership[]).filter((m) => m.tenants);
  if (memberships.length === 0) redirect({ href: '/app/onboarding', locale });
  const current = memberships.find((m) => m.tenants.slug === wanted) ?? memberships[0];
  const tenant = current.tenants;
  if (!tenant.modules.agenda) redirect({ href: `/app?t=${tenant.slug}`, locale });

  const sb = s.supabase!, today = todayInTz(tenant.timezone), range = dayRangeUtc(today, tenant.timezone);
  const [sv, sf, hr, bl, bk] = await Promise.all([
    sb.from('services').select('*').eq('tenant_id', tenant.id).order('position').order('name'),
    sb.from('staff').select('*').eq('tenant_id', tenant.id).order('name'),
    sb.from('business_hours').select('weekday,is_open,opens,closes').eq('tenant_id', tenant.id),
    sb.from('blocked_dates').select('day').eq('tenant_id', tenant.id).order('day'),
    sb.from('bookings').select('*').eq('tenant_id', tenant.id).gte('starts_at', range.from).lt('starts_at', range.to).order('starts_at'),
  ]);
  const cfg = agendaConfig(tenant.settings);

  return (
    <>
      <SiteHeader signedIn />
      <main className="wrap" style={{ padding: 'clamp(24px, 5vw, 56px) 0 80px', maxWidth: 900 }}>
        <Link className="link small" href={`/app?t=${tenant.slug}`}>← {t('back')}</Link>
        <h1 className="page-title" style={{ marginTop: 10 }}>{t('title')}</h1>
        <p className="muted" style={{ margin: '6px 0 26px' }}>{tenant.name}</p>
        <AgendaManager
          tenant={{ id: tenant.id, slug: tenant.slug, name: tenant.name, timezone: tenant.timezone, country: tenant.country, currency: tenant.currency, decimals: tenant.currency_decimals, moneyLocale: moneyLocale(locale, tenant.country), whatsapp: tenant.whatsapp, daysAhead: cfg.days_ahead, autoConfirm: cfg.auto_confirm }}
          services={(sv.data ?? []) as ServiceRow[]} staff={(sf.data ?? []) as StaffRow[]} hours={(hr.data ?? []) as HoursRow[]}
          blocked={((bl.data ?? []) as { day: string }[]).map((x) => x.day)} initialDate={today} initialBookings={(bk.data ?? []) as BookingRow[]}
          canAdmin={current.role === 'owner' || current.role === 'admin'}
        />
      </main>
    </>
  );
}
