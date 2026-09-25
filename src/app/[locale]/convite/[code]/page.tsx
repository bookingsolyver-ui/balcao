import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { SiteHeader } from '@/components/SiteHeader';
import { AcceptInviteButton } from '@/components/AcceptInviteButton';
import { ConfigMissing } from '@/components/ConfigMissing';
import { getSession } from '@/lib/session';

export default async function InvitePage({ params }: { params: Promise<{ locale: string; code: string }> }) {
  const { locale, code } = await params;
  setRequestLocale(locale);
  const s = await getSession();
  if (!s.configured) return <ConfigMissing />;
  const t = await getTranslations('inviteAccept');

  const { data } = await s.supabase!.rpc('invite_preview', { p_code: code });
  const preview = data as { tenant_name: string; role: 'admin' | 'staff'; staff_name: string | null; valid: boolean } | null;

  return (
    <>
      <SiteHeader signedIn={!!s.user} />
      <main className="wrap" style={{ padding: 'clamp(24px, 5vw, 56px) 0 80px', maxWidth: 480 }}>
        <div className="card" style={{ textAlign: 'center', padding: 'clamp(28px, 5vw, 44px) 24px' }}>
          {!preview || !preview.valid ? (
            <>
              <h1 style={{ fontSize: 22, fontWeight: 700 }}>{t('invalidTitle')}</h1>
              <p className="muted" style={{ marginTop: 10 }}>{t('invalidBody')}</p>
            </>
          ) : (
            <>
              <h1 style={{ fontSize: 22, fontWeight: 700 }}>{t('title', { tenant: preview.tenant_name })}</h1>
              <p className="muted" style={{ marginTop: 10 }}>
                {preview.staff_name ? t('bodyStaff', { name: preview.staff_name }) : t(`bodyRole.${preview.role}`)}
              </p>
              {s.user ? (
                <div style={{ marginTop: 22 }}><AcceptInviteButton code={code} /></div>
              ) : (
                <div style={{ marginTop: 22 }}>
                  <p className="muted small" style={{ marginBottom: 14 }}>{t('needLogin')}</p>
                  <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
                    <Link className="btn" href="/login">{t('login')}</Link>
                    <Link className="btn ghost" href="/signup">{t('signup')}</Link>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </>
  );
}
