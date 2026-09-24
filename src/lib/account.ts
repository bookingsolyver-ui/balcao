import { isValidEmail } from './email';

export type EmailChangeError = 'invalid' | 'same';
/** Só valida a forma do pedido — quem confirma de verdade é sempre o link que o Supabase envia para o e-mail novo. */
export function buildEmailChange(currentEmail: string, newEmail: string): { ok: true; email: string } | { ok: false; error: EmailChangeError } {
  const v = newEmail.trim();
  if (!isValidEmail(v)) return { ok: false, error: 'invalid' };
  if (v.toLowerCase() === currentEmail.trim().toLowerCase()) return { ok: false, error: 'same' };
  return { ok: true, email: v };
}
