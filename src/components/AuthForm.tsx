'use client';
import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/navigation';
import { createClient } from '@/lib/supabase/client';
import { authErrorKey } from '@/lib/errors';

export function AuthForm({ mode, returnTo }: { mode: 'login' | 'signup'; /** Caminho já validado (ex.: um convite de equipa) — sem isto, vai para o painel como sempre. */ returnTo?: string }) {
  const t = useTranslations('auth');
  const locale = useLocale();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const isLogin = mode === 'login';

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const supabase = createClient();
      const goNext = () => { if (returnTo) window.location.href = returnTo; else { router.replace('/app'); router.refresh(); } };
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) return setError(authErrorKey(error));
        goNext();
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(), password,
          options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(returnTo || `/${locale}/app`)}` },
        });
        if (error) return setError(authErrorKey(error));
        if (data.session) goNext(); else setSent(true);
      }
    } catch { setError('generic'); } finally { setBusy(false); }
  }

  return (
    <div className="card" style={{ maxWidth: 440, margin: '0 auto' }}>
      <h1 className="page-title" style={{ fontSize: 32 }}>{isLogin ? t('loginTitle') : t('signupTitle')}</h1>
      <p className="muted" style={{ margin: '6px 0 22px' }}>{isLogin ? t('loginSub') : t('signupSub')}</p>
      {sent ? <p className="ok-box" role="status">{t('checkEmail')}</p> : (
        <form className="form" onSubmit={onSubmit}>
          <div className="field"><label htmlFor="email">{t('email')}</label>
            <input id="email" className="input" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <div className="field"><label htmlFor="password">{t('password')}</label>
            <input id="password" className="input" type="password" required minLength={8} autoComplete={isLogin ? 'current-password' : 'new-password'} value={password} onChange={(e) => setPassword(e.target.value)} />
            {!isLogin && <span className="hint">{t('passwordHint')}</span>}</div>
          {error && <p className="err" role="alert">{t(`errors.${error}` as never)}</p>}
          <button className="btn block" type="submit" disabled={busy}>{busy ? t('submitting') : isLogin ? t('submitLogin') : t('submitSignup')}</button>
        </form>
      )}
      <p className="muted small" style={{ marginTop: 18, textAlign: 'center' }}>
        {isLogin ? t('noAccount') : t('haveAccount')}{' '}
        <Link className="link" href={isLogin ? '/signup' : '/login'}>{isLogin ? t('submitSignup') : t('submitLogin')}</Link>
      </p>
    </div>
  );
}
