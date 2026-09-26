import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { routing } from '@/i18n/routing';
import { safeInternalPath } from '@/lib/safe-redirect';

/** Destino do link de confirmação de e-mail: troca o código por uma sessão e entra no painel (ou no "next" indicado — ex.: um convite de equipa). */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = safeInternalPath(searchParams.get('next'), `/${routing.defaultLocale}/app`);
  const first = next.split('/')[1];
  const locale = (routing.locales as readonly string[]).includes(first) ? first : routing.defaultLocale;

  if (code) {
    try {
      const supabase = await createClient();
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) return NextResponse.redirect(`${origin}${next}`);
    } catch { /* cai para o login */ }
  }
  return NextResponse.redirect(`${origin}/${locale}/login`);
}
