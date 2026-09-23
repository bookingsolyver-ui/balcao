import { createClient } from '@supabase/supabase-js';

/**
 * Cliente com privilégios totais (ignora RLS). Só para código que corre no servidor
 * e nunca é exposto ao browser — hoje, só o recetor de eventos do Paddle.
 * NUNCA importar isto de um componente cliente nem devolver este cliente ao browser.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error('Falta SUPABASE_SERVICE_ROLE_KEY (ou NEXT_PUBLIC_SUPABASE_URL) nas variáveis de ambiente.');
  return createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
}
