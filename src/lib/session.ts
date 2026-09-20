import type { SupabaseClient, User } from '@supabase/supabase-js';
import { createClient } from './supabase/server';
import { hasSupabaseEnv } from './supabase/env';

export type Session =
  | { configured: false; supabase: null; user: null }
  | { configured: true; supabase: SupabaseClient; user: User | null };

export async function getSession(): Promise<Session> {
  if (!hasSupabaseEnv()) return { configured: false, supabase: null, user: null };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return { configured: true, supabase, user };
}
