'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import { buildEmailChange } from '@/lib/account';

export function AccountForm({ currentEmail, initialMsg }: { currentEmail: string; /** Só para testes/SSR: mostra já uma mensagem. */ initialMsg?: { ok: boolean; text: string } }) {
  const t = useTranslations('account');
  const tt = t as unknown as (key: string, values?: Record<string, string | number>) => string;
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(initialMsg ?? null);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setMsg(null);
    const b = buildEmailChange(currentEmail, email);
    if (!b.ok) return setMsg({ ok: false, text: tt(`errors.${b.error}`) });
    setBusy(true);
    try {
      // O Supabase nunca troca o e-mail já aqui: manda um link de confirmação para o e-mail novo
      // (e, se "Secure email change" estiver ligado no projeto, exige confirmar também pelo antigo).
      const { error } = await createClient().auth.updateUser({ email: b.email });
      if (error) return setMsg({ ok: false, text: tt('errors.generic') });
      setMsg({ ok: true, text: tt('confirmSent', { email: b.email }) });
      setEmail('');
    } catch { setMsg({ ok: false, text: tt('errors.generic') }); } finally { setBusy(false); }
  }

  return (
    <div className="card">
      <h2 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-.025em' }}>{t('emailTitle')}</h2>
      <div className="list" style={{ background: 'var(--bg)', margin: '14px 0 20px' }}>
        <div className="row" style={{ minHeight: 48, padding: '10px 16px' }}><div className="g"><small>{t('currentEmail')}</small><strong style={{ fontWeight: 500 }}>{currentEmail}</strong></div></div>
      </div>
      <form className="form" onSubmit={submit}>
        <div className="field"><label htmlFor="acc-email">{t('newEmail')}</label><input id="acc-email" className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <p className="hint">{t('confirmHint')}</p>
        {msg && <p className={msg.ok ? 'ok-box' : 'err'} role={msg.ok ? 'status' : 'alert'}>{msg.text}</p>}
        <div><button className="btn" type="submit" disabled={busy}>{busy ? t('sending') : t('changeEmail')}</button></div>
      </form>
    </div>
  );
}
