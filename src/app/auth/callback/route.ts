import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { routing } from '@/i18n/routing';

/** Destino do link de confirmação de e-mail: troca o código por uma sessão e entra no painel. */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const rawNext = searchParams.get('next') ?? '';
  // só caminhos internos (evita redirecionamento aberto para outro site)
  const next = rawNext.startsWith('/') && !rawNext.startsWith('//') && !rawNext.includes('\\') ? rawNext : `/${routing.defaultLocale}/app`;
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
