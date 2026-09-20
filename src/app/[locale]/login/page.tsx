import { setRequestLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { SiteHeader } from '@/components/SiteHeader';
import { AuthForm } from '@/components/AuthForm';
import { ConfigMissing } from '@/components/ConfigMissing';
import { getSession } from '@/lib/session';

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const s = await getSession();
  if (!s.configured) return <ConfigMissing />;
  if (s.user) redirect({ href: '/app', locale });
  return (
    <>
      <SiteHeader signedIn={false} />
      <main className="wrap" style={{ padding: 'clamp(32px, 7vw, 80px) 0' }}><AuthForm mode="login" /></main>
    </>
  );
}
