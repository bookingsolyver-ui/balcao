import { setRequestLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { SiteHeader } from '@/components/SiteHeader';
import { Icon } from '@/components/Icon';
import { getSession } from '@/lib/session';

const NICHES = [['restaurant', 'menu'], ['salon', 'agenda'], ['beauty_store', 'catalog'], ['moving', 'moving'], ['general', 'loyalty']] as const;

export default async function Landing({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('landing');
  const tn = await getTranslations('nav');
  const s = await getSession();
  return (
    <>
      <SiteHeader signedIn={!!s.user} />
      <main className="wrap">
        <section className="hero" style={{ padding: 'clamp(48px, 9vw, 110px) 0 clamp(36px, 5vw, 64px)' }}>
          <h1>{t('title')}</h1>
          <p className="lead">{t('text')}</p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 28 }}>
            <Link href={s.user ? '/app' : '/signup'} className="btn">{s.user ? tn('dashboard') : t('ctaStart')}</Link>
            {!s.user && <Link href="/login" className="btn gray">{t('ctaLogin')}</Link>}
          </div>
        </section>

        <section style={{ marginBottom: 72 }}>
          <h2 className="h2" style={{ marginBottom: 22 }}>{t('nichesTitle')}</h2>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))' }}>
            {NICHES.map(([n, icon]) => (
              <div key={n} className="card">
                <span className="mi"><Icon name={icon} size={26} /></span>
                <h3 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-.025em', marginTop: 28 }}>{t(`niches.${n}.name`)}</h3>
                <p className="muted" style={{ marginTop: 6 }}>{t(`niches.${n}.desc`)}</p>
              </div>
            ))}
          </div>
        </section>

        <section style={{ marginBottom: 80 }}>
          <div className="grid c3">
            {(['currency', 'secure', 'whatsapp'] as const).map((f) => (
              <div key={f}><h3 style={{ fontSize: 19, fontWeight: 700 }}>{t(`features.${f}.title`)}</h3><p className="muted" style={{ marginTop: 6 }}>{t(`features.${f}.desc`)}</p></div>
            ))}
          </div>
        </section>
      </main>
      <footer style={{ borderTop: '1px solid var(--line)', padding: '26px 0 40px', color: 'var(--fg3)', fontSize: 13 }}>
        <div className="wrap">{t('footer')}</div>
      </footer>
    </>
  );
}
