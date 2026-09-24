import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link, redirect } from '@/i18n/navigation';
import { SiteHeader } from '@/components/SiteHeader';
import { AccountForm } from '@/components/AccountForm';
import { ConfigMissing } from '@/components/ConfigMissing';
import { getSession } from '@/lib/session';

export default async function AccountPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const s = await getSession();
  if (!s.configured) return <ConfigMissing />;
  if (!s.user) redirect({ href: '/login', locale });
  const t = await getTranslations('account');

  return (
    <>
      <SiteHeader signedIn />
      <main className="wrap" style={{ padding: 'clamp(24px, 5vw, 56px) 0 80px', maxWidth: 640 }}>
        <Link className="link small" href="/app">← {t('back')}</Link>
        <h1 className="page-title" style={{ marginTop: 10, marginBottom: 26 }}>{t('title')}</h1>
        <AccountForm currentEmail={s.user!.email!} />
      </main>
    </>
  );
}
