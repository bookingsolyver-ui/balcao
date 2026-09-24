'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import { buildReview, toReviewForm, type ReviewForm as RForm, type ReviewRow } from '@/lib/reviews';

export function ReviewForm({ tenantId, tenantName, existing }: { tenantId: string; tenantName: string; existing: ReviewRow | null }) {
  const t = useTranslations('review');
  const tt = t as unknown as (key: string, values?: Record<string, string | number>) => string;
  const [f, setF] = useState<RForm>(toReviewForm(existing, tenantName));
  const [row, setRow] = useState(existing);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setMsg(null);
    const b = buildReview(f);
    if (!b.ok) return setMsg({ ok: false, text: tt(`errors.${b.error}`) });
    setBusy(true);
    try {
      const sb = createClient();
      const { data, error } = row
        ? await sb.from('reviews').update(b.value).eq('id', row.id).select().single()
        : await sb.from('reviews').insert({ tenant_id: tenantId, ...b.value }).select().single();
      if (error) return setMsg({ ok: false, text: tt('errors.generic') });
      setRow(data as ReviewRow); setMsg({ ok: true, text: row ? t('updated') : t('published') });
    } catch { setMsg({ ok: false, text: tt('errors.generic') }); } finally { setBusy(false); }
  }

  return (
    <div className="card">
      <h2 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-.025em' }}>{t('title')}</h2>
      <p className="muted small" style={{ margin: '6px 0 16px' }}>{t('hint')}</p>
      <form className="form" onSubmit={submit}>
        <div className="field"><span className="lbl">{t('rating')}</span>
          <div className="stars" role="radiogroup" aria-label={t('rating')}>
            {[1, 2, 3, 4, 5].map((n) => (
              <button type="button" key={n} className={n <= f.rating ? 'on' : ''} role="radio" aria-checked={n === f.rating} aria-label={tt('stars', { n })} onClick={() => setF({ ...f, rating: n })}>★</button>
            ))}
          </div>
        </div>
        <div className="field"><label htmlFor="rv-body">{t('body')}</label><textarea id="rv-body" className="input" rows={4} maxLength={500} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} /><span className="hint">{tt('bodyHint', { n: f.body.trim().length })}</span></div>
        <div className="field"><label htmlFor="rv-name">{t('authorName')}</label><input id="rv-name" className="input" maxLength={80} value={f.authorName} onChange={(e) => setF({ ...f, authorName: e.target.value })} /><span className="hint">{t('authorNameHint')}</span></div>
        {msg && <p className={msg.ok ? 'ok-box' : 'err'} role={msg.ok ? 'status' : 'alert'}>{msg.text}</p>}
        <div><button className="btn" type="submit" disabled={busy}>{busy ? t('saving') : row ? t('save') : t('publish')}</button></div>
      </form>
    </div>
  );
}
