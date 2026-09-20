'use client';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { createClient } from '@/lib/supabase/client';

export function SignOutButton() {
  const t = useTranslations('nav');
  const router = useRouter();
  return (
    <button
      className="btn sm gray"
      onClick={async () => { await createClient().auth.signOut(); router.replace('/'); router.refresh(); }}
    >
      {t('logout')}
    </button>
  );
}
