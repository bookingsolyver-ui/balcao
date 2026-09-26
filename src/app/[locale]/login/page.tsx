import { setRequestLocale } from 'next-intl/server';
import { redirect as rawRedirect } from 'next/navigation';
import { redirect } from '@/i18n/navigation';
import { SiteHeader } from '@/components/SiteHeader';
import { AuthForm } from '@/components/AuthForm';
import { ConfigMissing } from '@/components/ConfigMissing';
import { getSession } from '@/lib/session';
import { safeInternalPath } from '@/lib/safe-redirect';

export default async function Page({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ returnTo?: string }> }) {
  const { locale } = await params;
  const { returnTo: rawReturnTo } = await searchParams;
  setRequestLocale(locale);
  const s = await getSession();
  if (!s.configured) return <ConfigMissing />;
  // já validado aqui: um "returnTo" seguro é sempre um caminho completo (com idioma), por isso usa-se tal e qual, sem passar outra vez pelo prefixo automático de idioma.
  const returnTo = rawReturnTo ? safeInternalPath(rawReturnTo, '') || undefined : undefined;
  if (s.user) { if (returnTo) rawRedirect(returnTo); redirect({ href: '/app', locale }); }
  return (
    <>
      <SiteHeader signedIn={false} />
      <main className="wrap" style={{ padding: 'clamp(32px, 7vw, 80px) 0' }}><AuthForm mode="login" returnTo={returnTo} /></main>
    </>
  );
}
