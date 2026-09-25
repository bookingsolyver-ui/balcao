'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from '@/i18n/navigation';

export function AcceptInviteButton({ code }: { code: string }) {
  const t = useTranslations('inviteAccept');
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);

  async function accept() {
    setBusy(true); setErr(false);
    try {
      const { data, error } = await createClient().rpc('accept_invite', { p_code: code });
      if (error) { setErr(true); return; }
      const row = data as { tenant_slug: string };
      router.push(`/app?t=${row.tenant_slug}`);
    } finally { setBusy(false); }
  }

  return (
    <div>
      <button className="btn" onClick={accept} disabled={busy}>{busy ? t('accepting') : t('accept')}</button>
      {err && <p className="err" role="alert" style={{ marginTop: 10 }}>{t('errors.generic')}</p>}
    </div>
  );
}
