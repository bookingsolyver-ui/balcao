/** Códigos que a base de dados devolve como mensagem (raise exception '...'). */
const KNOWN = new Set([
  'tenant_not_found', 'module_disabled', 'invalid_name', 'invalid_phone', 'fulfillment_not_allowed', 'address_required',
  'table_required', 'empty_cart', 'payment_not_allowed', 'too_many_orders', 'invalid_quantity', 'item_unavailable',
  'insufficient_stock', 'below_minimum', 'slot_unavailable', 'service_unavailable', 'too_many_bookings', 'not_found',
  'cannot_cancel', 'forbidden', 'final_status', 'not_authenticated', 'tenant_limit', 'invalid_timezone', 'invalid_niche',
  'not_enough_balance', 'no_program', 'no_points',
]);

export interface DbError { code?: string; message?: string }

/** Converte um erro do Postgres/PostgREST numa chave de tradução (errors.*). */
export function dbErrorKey(err: DbError | null | undefined): string {
  if (!err) return 'generic';
  if (err.message && KNOWN.has(err.message)) return err.message;
  if (err.code === '23505') return 'slug_taken';      // unique_violation (slug já existe)
  if (err.code === '23514') return 'invalid_data';     // check_violation (slug/nome/telefone fora do formato)
  if (err.code === '42501') return 'forbidden';
  return 'generic';
}

/** Erros do Supabase Auth -> chave de tradução (auth.errors.*). */
export function authErrorKey(err: { code?: string; message?: string; status?: number } | null | undefined): string {
  if (!err) return 'generic';
  const c = err.code ?? '', m = (err.message ?? '').toLowerCase();
  if (c === 'invalid_credentials' || m.includes('invalid login')) return 'invalid_credentials';
  if (c === 'weak_password' || m.includes('password should be')) return 'weak_password';
  if (c === 'user_already_exists' || c === 'email_exists' || m.includes('already registered')) return 'email_in_use';
  if (c === 'email_not_confirmed' || m.includes('not confirmed')) return 'email_not_confirmed';
  if (c === 'over_request_rate_limit' || c === 'over_email_send_rate_limit' || err.status === 429) return 'rate_limit';
  return 'generic';
}
