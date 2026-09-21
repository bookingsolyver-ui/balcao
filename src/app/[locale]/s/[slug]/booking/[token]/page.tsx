import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { ConfigMissing } from '@/components/ConfigMissing';
import { LocaleSwitcher } from '@/components/LocaleSwitcher';
import { BookingTracker } from '@/components/store/BookingTracker';
import { getSession } from '@/lib/session';
import { isValidSlug } from '@/lib/slug';
import { moneyLocale } from '@/lib/money';
import type { TrackBooking } from '@/lib/booking';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function TrackBookingPage({ params }: { params: Promise<{ locale: string; slug: string; token: string }> }) {
  const { locale, slug, token } = await params;
  setRequestLocale(locale);
  if (!isValidSlug(slug) || !UUID.test(token)) notFound();
  const s = await getSession();
  if (!s.configured) return <ConfigMissing />;
  const t = await getTranslations('booking');

  const { data } = await s.supabase!.rpc('get_booking', { p_token: token });
  const b = data as TrackBooking | null;
  if (!b || (b.tenant_slug && b.tenant_slug !== slug)) notFound(); // marcação de outra loja não aparece aqui
  const { data: tenant } = await s.supabase!.from('tenants').select('name,address,timezone,country,currency,currency_decimals,accent').eq('slug', slug).maybeSingle();
  if (!tenant) notFound();

  return (
    <div data-accent={tenant.accent} style={{ minHeight: '100vh' }}>
      <header className="nav"><div className="nav-in"><span className="brand"><span className="logo" aria-hidden="true">{String(tenant.name).charAt(0).toUpperCase()}</span>{tenant.name}</span><span className="spacer" /><LocaleSwitcher /></div></header>
      <main className="wrap" style={{ padding: 'clamp(24px, 5vw, 48px) 0 56px', maxWidth: 640 }}>
        <BookingTracker token={token} initial={b} tenant={{ name: tenant.name, address: tenant.address, timezone: tenant.timezone, moneyLocale: moneyLocale(locale, tenant.country), currency: tenant.currency, decimals: tenant.currency_decimals }} />
        <p style={{ marginTop: 28 }}><Link className="link" href={`/s/${slug}?tab=agenda`}>← {t('backToStore')}</Link></p>
      </main>
    </div>
  );
}
