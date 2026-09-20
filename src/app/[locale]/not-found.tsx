import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';

export default async function NotFound() {
  const t = await getTranslations('store');
  return (
    <main className="wrap" style={{ padding: '96px 0', textAlign: 'center' }}>
      <h1 className="page-title">{t('notFoundTitle')}</h1>
      <p className="muted" style={{ margin: '10px 0 24px' }}>{t('notFoundText')}</p>
      <Link href="/" className="btn">{t('home')}</Link>
    </main>
  );
}
