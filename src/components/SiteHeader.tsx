import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { LocaleSwitcher } from './LocaleSwitcher';
import { Logo } from './Logo';
import { SignOutButton } from './SignOutButton';

export async function SiteHeader({ signedIn }: { signedIn: boolean }) {
  const t = await getTranslations('nav');
  return (
    <header className="nav">
      <div className="nav-in">
        <Link href="/" className="brand"><Logo />Balcão</Link>
        <span className="spacer" />
        <LocaleSwitcher />
        {signedIn ? (
          <>
            <Link href="/app" className="btn sm ghost">{t('dashboard')}</Link>
            <SignOutButton />
          </>
        ) : (
          <>
            <Link href="/login" className="btn sm gray">{t('login')}</Link>
            <Link href="/signup" className="btn sm">{t('signup')}</Link>
          </>
        )}
      </div>
    </header>
  );
}
