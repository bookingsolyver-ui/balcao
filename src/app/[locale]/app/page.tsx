import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link, redirect } from '@/i18n/navigation';
import { routing, type Locale } from '@/i18n/routing';
import { SiteHeader } from '@/components/SiteHeader';
import { Icon } from '@/components/Icon';
import { ConfigMissing } from '@/components/ConfigMissing';
import { getSession } from '@/lib/session';
import { countryName, currencyName } from '@/lib/countries';
import { fmtPhoneIntl } from '@/lib/phone';
import { MODULE_IDS, type Membership } from '@/lib/types';

export default async function Dashboard({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ t?: string }> }) {
  const { locale } = await params;
  const { t: wanted } = await searchParams;
  setRequestLocale(locale);
  const s = await getSession();
  if (!s.configured) return <ConfigMissing />;
  if (!s.user) redirect({ href: '/login', locale });
  const t = await getTranslations('dashboard');
  const tn = await getTranslations('landing.niches');

  const { data } = await s.supabase!.from('tenant_members').select('role, tenants(*)').eq('user_id', s.user!.id);
  const memberships = ((data ?? []) as unknown as Membership[]).filter((m) => m.tenants);
  if (memberships.length === 0) redirect({ href: '/app/onboarding', locale });

  const current = memberships.find((m) => m.tenants.slug === wanted) ?? memberships[0];
  const tenant = current.tenants;
  const storeLocale = (routing.locales as readonly string[]).includes(tenant.locale) ? (tenant.locale as Locale) : routing.defaultLocale;
  const niche = ['restaurant', 'salon', 'beauty_store', 'general'].includes(tenant.niche) ? tn(`${tenant.niche}.name` as never) : tenant.niche;

  return (
    <>
      <SiteHeader signedIn />
      <main className="wrap" style={{ padding: 'clamp(24px, 5vw, 56px) 0 80px' }}>
        <p className="muted">{t('hello')}, {s.user!.email}</p>
        <h1 className="page-title" style={{ marginTop: 4 }}>{tenant.name}</h1>

        {memberships.length > 1 && (
          <div className="tabs" style={{ marginTop: 18 }} aria-label={t('switch')}>
            {memberships.map((m) => <Link key={m.tenants.id} href={`/app?t=${m.tenants.slug}`} aria-current={m.tenants.id === tenant.id ? 'page' : undefined}>{m.tenants.name}</Link>)}
          </div>
        )}

        <div className="grid c2" style={{ marginTop: 26 }}>
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <h2 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-.025em' }}>{t('storeLink')}</h2>
              <span className={`badge ${tenant.is_published ? 'ok' : ''}`}>{tenant.is_published ? t('moduleActive') : t('moduleOff')}</span>
            </div>
            <p className="muted small" style={{ margin: '8px 0 18px', wordBreak: 'break-all' }}>/{storeLocale}/s/{tenant.slug}</p>
            <Link href={`/s/${tenant.slug}`} locale={storeLocale} className="btn"><Icon name="ext" size={18} /> {t('openStore')}</Link>
          </div>

          <div className="card">
            <h2 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-.025em', marginBottom: 12 }}>{t('settings')}</h2>
            <div className="list" style={{ background: 'var(--bg)' }}>
              {[
                [t('niche'), niche],
                [t('currency'), `${tenant.currency} · ${currencyName(tenant.currency, locale)}`],
                [t('timezone'), tenant.timezone.replace(/_/g, ' ')],
                [t('language'), `${tenant.locale} · ${countryName(tenant.country, locale)}`],
                [t('whatsapp'), tenant.whatsapp ? fmtPhoneIntl(tenant.whatsapp) : t('notSet')],
                [t('role'), t(`roles.${current.role}` as never)],
              ].map(([k, v]) => (
                <div className="row" key={k} style={{ minHeight: 48, padding: '10px 16px' }}><div className="g"><small>{k}</small><strong style={{ fontWeight: 500 }}>{v}</strong></div></div>
              ))}
            </div>
          </div>
        </div>

        <h2 className="h2" style={{ margin: '44px 0 16px' }}>{t('modules')}</h2>
        <div className="grid c2">
          {MODULE_IDS.map((m) => {
            const on = tenant.modules[m];
            return (
              <div key={m} className="card" style={{ opacity: on ? 1 : .6 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span className="mi" style={on ? undefined : { background: 'var(--fg3)' }}><Icon name={m} size={24} /></span>
                  <span className={`badge ${on ? 'ok' : ''}`}>{on ? t('moduleActive') : t('moduleOff')}</span>
                </div>
                <h3 style={{ fontSize: 21, fontWeight: 700, letterSpacing: '-.025em', marginTop: 22 }}>{t(`moduleNames.${m}` as never)}</h3>
                <p className="muted" style={{ marginTop: 4 }}>{t(`moduleDesc.${m}` as never)}</p>
                {on && <p className="small" style={{ marginTop: 12, color: 'var(--fg3)' }}>{t('comingSoon')}</p>}
              </div>
            );
          })}
        </div>
        <p className="muted small" style={{ marginTop: 28 }}>{t('phase')}</p>
        <p style={{ marginTop: 14 }}><Link className="link" href="/app/onboarding">{t('another')}</Link></p>
      </main>
    </>
  );
}
