import { notFound } from 'next/navigation';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { ConfigMissing } from '@/components/ConfigMissing';
import { LocaleSwitcher } from '@/components/LocaleSwitcher';
import { MoveTracker } from '@/components/store/MoveTracker';
import { getSession } from '@/lib/session';
import { isValidSlug } from '@/lib/slug';
import { moneyLocale } from '@/lib/money';
import type { MoveTrack } from '@/lib/moving';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function TrackMove({ params }: { params: Promise<{ locale: string; slug: string; token: string }> }) {
  const { locale, slug, token } = await params;
  setRequestLocale(locale);
  if (!isValidSlug(slug) || !UUID.test(token)) notFound();
  const s = await getSession();
  if (!s.configured) return <ConfigMissing />;
  const t = await getTranslations('move');

  const { data } = await s.supabase!.rpc('get_move_request', { p_token: token });
  const mv = data as MoveTrack | null;
  if (!mv || (mv.tenant_slug && mv.tenant_slug !== slug)) notFound();
  const { data: tenant } = await s.supabase!.from('tenants').select('name,country,currency_decimals,accent').eq('slug', slug).maybeSingle();
  if (!tenant) notFound();

  return (
    <div data-accent={tenant.accent} style={{ minHeight: '100vh' }}>
      <header className="nav"><div className="nav-in"><span className="brand"><span className="logo" aria-hidden="true">{String(tenant.name).charAt(0).toUpperCase()}</span>{tenant.name}</span><span className="spacer" /><LocaleSwitcher /></div></header>
      <main className="wrap" style={{ padding: 'clamp(24px, 5vw, 48px) 0 56px', maxWidth: 640 }}>
        <MoveTracker token={token} initial={mv} tenant={{ name: tenant.name, moneyLocale: moneyLocale(locale, tenant.country), decimals: tenant.currency_decimals }} />
        <p style={{ marginTop: 28 }}><Link className="link" href={`/s/${slug}`}>← {t('backToStore')}</Link></p>
      </main>
    </div>
  );
}
