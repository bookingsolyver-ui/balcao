'use client';
import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import { resizeToJpeg } from '@/lib/image';
import { imageUrl, ITEM_BUCKET } from '@/lib/storage';

interface Props { tenantId: string; logoPath: string | null; coverPath: string | null; canEdit: boolean }

export function StoreMediaForm({ tenantId, logoPath: initialLogo, coverPath: initialCover, canEdit }: Props) {
  const t = useTranslations('settings');
  const [logoPath, setLogoPath] = useState(initialLogo);
  const [coverPath, setCoverPath] = useState(initialCover);
  const [busy, setBusy] = useState<'logo' | 'cover' | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const logoInput = useRef<HTMLInputElement>(null);
  const coverInput = useRef<HTMLInputElement>(null);

  async function upload(kind: 'logo' | 'cover', file: File, max: number) {
    setErr(null); setBusy(kind);
    const sb = createClient();
    const prevPath = kind === 'logo' ? logoPath : coverPath;
    try {
      let blob: Blob;
      try { blob = await resizeToJpeg(file, max); } catch { setErr('upload'); return; }
      const path = `${tenantId}/store/${kind}-${crypto.randomUUID()}.jpg`;
      const up = await sb.storage.from(ITEM_BUCKET).upload(path, blob, { contentType: 'image/jpeg', cacheControl: '31536000' });
      if (up.error) { setErr('upload'); return; }
      const field = kind === 'logo' ? { logo_path: path } : { cover_path: path };
      const { error } = await sb.from('tenants').update(field).eq('id', tenantId);
      if (error) { await sb.storage.from(ITEM_BUCKET).remove([path]); setErr('upload'); return; }
      if (prevPath) await sb.storage.from(ITEM_BUCKET).remove([prevPath]);
      if (kind === 'logo') setLogoPath(path); else setCoverPath(path);
    } finally { setBusy(null); }
  }
  async function remove(kind: 'logo' | 'cover') {
    setErr(null); setBusy(kind);
    const sb = createClient();
    const path = kind === 'logo' ? logoPath : coverPath;
    const field = kind === 'logo' ? { logo_path: null } : { cover_path: null };
    try {
      const { error } = await sb.from('tenants').update(field).eq('id', tenantId);
      if (error) { setErr('upload'); return; }
      if (path) await sb.storage.from(ITEM_BUCKET).remove([path]);
      if (kind === 'logo') setLogoPath(null); else setCoverPath(null);
    } finally { setBusy(null); }
  }
  const pick = (kind: 'logo' | 'cover', max: number) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; e.target.value = '';
    if (file) void upload(kind, file, max);
  };

  return (
    <section>
      <h2 className="h2" style={{ fontSize: 24, marginBottom: 4 }}>{t('storeMedia')}</h2>
      <p className="muted small" style={{ margin: '0 0 14px' }}>{t('storeMediaHint')}</p>
      <div className="card">
        <div className="frow" style={{ alignItems: 'flex-start' }}>
          <div className="field">
            <span className="lbl">{t('logo')}</span>
            <div className="media-slot" style={{ width: 96, height: 96, borderRadius: '50%' }}>
              {logoPath ? <img src={imageUrl(logoPath)} alt="" /> : <span className="ph">{t('addLogo')}</span>}
              {canEdit && <input ref={logoInput} type="file" accept="image/*" onChange={pick('logo', 400)} disabled={busy === 'logo'} aria-label={t('logo')} />}
            </div>
            {canEdit && logoPath && <button type="button" className="link small" style={{ marginTop: 8 }} onClick={() => remove('logo')} disabled={busy === 'logo'}>{t('removeImage')}</button>}
          </div>
          <div className="field" style={{ flex: 1, minWidth: 220 }}>
            <span className="lbl">{t('cover')}</span>
            <div className="media-slot" style={{ width: '100%', aspectRatio: '16/6' }}>
              {coverPath ? <img src={imageUrl(coverPath)} alt="" /> : <span className="ph">{t('addCover')}</span>}
              {canEdit && <input ref={coverInput} type="file" accept="image/*" onChange={pick('cover', 1600)} disabled={busy === 'cover'} aria-label={t('cover')} />}
            </div>
            {canEdit && coverPath && <button type="button" className="link small" style={{ marginTop: 8 }} onClick={() => remove('cover')} disabled={busy === 'cover'}>{t('removeImage')}</button>}
          </div>
        </div>
        {err && <p className="err" role="alert" style={{ marginTop: 12 }}>{t('errors.upload')}</p>}
      </div>
    </section>
  );
}
