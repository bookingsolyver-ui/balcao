'use client';
import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import { inviteUrl, type StaffOption } from '@/lib/invites';


interface Invite { id: string; code: string; role: 'admin' | 'staff'; staff_id: string | null; expires_at: string }
interface Props { tenantId: string; staff: StaffOption[]; linkedStaffIds: string[]; initialInvites: Invite[] }

export function TeamInvites({ tenantId, staff, linkedStaffIds, initialInvites }: Props) {
  const t = useTranslations('team');
  const locale = useLocale();
  const [invites, setInvites] = useState(initialInvites);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [lastLink, setLastLink] = useState<{ staffId: string | null; url: string } | null>(null);
  const linked = new Set(linkedStaffIds);

  async function invite(role: 'admin' | 'staff', staffId: string | null) {
    setErr(null); setBusy(staffId ?? 'admin');
    try {
      const { data, error } = await createClient().rpc('create_invite', { p_tenant: tenantId, p_role: role, p_staff: staffId });
      if (error) { setErr('generic'); return; }
      const row = data as { id: string; code: string };
      const url = inviteUrl(window.location.origin, locale, row.code);
      setLastLink({ staffId, url });
      setInvites((v) => [{ id: row.id, code: row.code, role, staff_id: staffId, expires_at: new Date(Date.now() + 7 * 86400000).toISOString() }, ...v]);
    } finally { setBusy(null); }
  }
  async function revoke(id: string) {
    setBusy(id);
    try { await createClient().from('tenant_invites').delete().eq('id', id); setInvites((v) => v.filter((i) => i.id !== id)); if (lastLink) setLastLink(null); }
    finally { setBusy(null); }
  }
  function copy(url: string) { void navigator.clipboard?.writeText(url); }

  return (
    <section>
      <h2 className="h2" style={{ fontSize: 24, marginBottom: 4 }}>{t('title')}</h2>
      <p className="muted small" style={{ margin: '0 0 14px' }}>{t('hint')}</p>

      {staff.length > 0 && (
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="list" style={{ background: 'var(--bg)' }}>
            {staff.map((s) => (
              <div className="row" key={s.id}>
                <div className="g"><strong>{s.name}</strong></div>
                {linked.has(s.id)
                  ? <span className="badge ok">{t('hasAccess')}</span>
                  : <button className="btn sm" disabled={busy === s.id} onClick={() => invite('staff', s.id)}>{busy === s.id ? t('creating') : t('invite')}</button>}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 12 }}>
          <span style={{ fontWeight: 600 }}>{t('adminTitle')}</span>
          <button className="btn sm ghost" disabled={busy === 'admin'} onClick={() => invite('admin', null)}>{busy === 'admin' ? t('creating') : t('inviteAdmin')}</button>
        </div>
        <p className="muted small">{t('adminHint')}</p>
      </div>

      {err && <p className="err" role="alert" style={{ marginTop: 12 }}>{t('errors.generic')}</p>}

      {lastLink && (
        <div className="card" style={{ marginTop: 14 }}>
          <p style={{ fontWeight: 600, marginBottom: 8 }}>{t('linkReady')}</p>
          <div className="invite-link"><span style={{ flex: 1 }}>{lastLink.url}</span>
            <button type="button" className="iconbtn" onClick={() => copy(lastLink.url)} aria-label={t('copy')}>{t('copy')}</button>
          </div>
          <p className="muted small" style={{ marginTop: 10 }}>
            <a className="link" target="_blank" rel="noopener" href={`https://wa.me/?text=${encodeURIComponent(t('waMessage', { url: lastLink.url }))}`}>{t('shareWhatsapp')}</a>
          </p>
        </div>
      )}

      {invites.filter((i) => !usedOrExpired(i)).length > 0 && (
        <div style={{ marginTop: 20 }}>
          <span className="lbl">{t('pending')}</span>
          <div className="list" style={{ background: 'var(--bg)', marginTop: 8 }}>
            {invites.filter((i) => !usedOrExpired(i)).map((i) => (
              <div className="row" key={i.id}>
                <div className="g"><strong>{i.staff_id ? staff.find((s) => s.id === i.staff_id)?.name ?? i.role : t(`roles.${i.role}`)}</strong><span>{i.code}</span></div>
                <button className="iconbtn" disabled={busy === i.id} onClick={() => revoke(i.id)}>{t('revoke')}</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
function usedOrExpired(i: Invite) { return new Date(i.expires_at).getTime() < Date.now(); }
