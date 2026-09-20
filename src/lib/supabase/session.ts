import { createServerClient } from '@supabase/ssr';
import type { NextRequest, NextResponse } from 'next/server';
import { hasSupabaseEnv, supabaseEnv } from './env';

/** Renova o token de sessão e copia os cookies novos para a resposta. */
export async function refreshSession(request: NextRequest, response: NextResponse): Promise<NextResponse> {
  if (!hasSupabaseEnv()) return response;
  const { url, key } = supabaseEnv();
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(list) {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  await supabase.auth.getUser();
  return response;
}
