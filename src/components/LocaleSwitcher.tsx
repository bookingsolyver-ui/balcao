'use client';
import { useLocale, useTranslations } from 'next-intl';
import { usePathname, useRouter } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';

const LABELS: Record<string, string> = { 'pt-PT': 'Português (PT)', 'pt-BR': 'Português (BR)', en: 'English', es: 'Español' };

export function LocaleSwitcher() {
  const locale = useLocale();
  const t = useTranslations('common');
  const router = useRouter();
  const pathname = usePathname();
  return (
    <select
      className="input"
      style={{ minHeight: 36, width: 'auto', padding: '4px 30px 4px 12px', fontSize: 14, borderRadius: 999, background: 'var(--bg3)', borderColor: 'transparent' }}
      aria-label={t('language')}
      value={locale}
      onChange={(e) => router.replace(pathname, { locale: e.target.value })}
    >
      {routing.locales.map((l) => <option key={l} value={l}>{LABELS[l]}</option>)}
    </select>
  );
}
