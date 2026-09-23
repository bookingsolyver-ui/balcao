import { createHmac, timingSafeEqual } from 'node:crypto';

/* ---------- estado da subscrição ---------- */
export type BillingStatus = 'trialing' | 'active' | 'past_due' | 'paused' | 'canceled';
export interface BillingRow { tenant_id: string; status: BillingStatus; plan: string; paddle_customer_id: string | null; paddle_subscription_id: string | null; trial_ends_at: string | null; current_period_end: string | null }

/** Estados em que o negócio deve continuar a funcionar normalmente. */
export const isBillingOk = (s: BillingStatus): boolean => s === 'trialing' || s === 'active' || s === 'past_due';
/** true só quando o período de avaliação já passou e nunca houve pagamento. */
export const trialExpired = (b: Pick<BillingRow, 'status' | 'trial_ends_at'>, now: Date = new Date()): boolean =>
  b.status === 'trialing' && b.trial_ends_at != null && new Date(b.trial_ends_at).getTime() < now.getTime();
export function daysLeft(iso: string | null, now: Date = new Date()): number | null {
  if (!iso) return null;
  return Math.max(0, Math.ceil((new Date(iso).getTime() - now.getTime()) / 86400000));
}

/* ---------- assinatura do webhook do Paddle (Paddle-Signature: ts=...;h1=...) ---------- */
export interface VerifyResult { ok: boolean; reason?: 'missing_header' | 'malformed_header' | 'bad_signature' | 'too_old' }
/** maxAgeSeconds evita reenvios tardios ou capturados serem aceites (proteção de repetição). */
export function verifyPaddleSignature(rawBody: string, header: string | null, secret: string, now: Date = new Date(), maxAgeSeconds = 300): VerifyResult {
  if (!header) return { ok: false, reason: 'missing_header' };
  const parts = Object.fromEntries(header.split(';').map((p) => p.split('=') as [string, string]));
  const ts = parts.ts, h1 = parts.h1;
  if (!ts || !h1 || !/^\d+$/.test(ts)) return { ok: false, reason: 'malformed_header' };
  const ageSeconds = now.getTime() / 1000 - Number(ts);
  if (ageSeconds > maxAgeSeconds || ageSeconds < -30) return { ok: false, reason: 'too_old' };
  const expected = createHmac('sha256', secret).update(`${ts}:${rawBody}`).digest('hex');
  const a = Buffer.from(expected, 'hex'), b = Buffer.from(h1, 'hex');
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, reason: 'bad_signature' };
  return { ok: true };
}

/* ---------- evento do Paddle -> atualização a gravar ---------- */
export interface PaddleSubscriptionData {
  id: string; customer_id: string; status: string;
  current_billing_period?: { ends_at?: string | null } | null;
  custom_data?: { tenant_id?: string } | null;
}
export interface PaddleEvent { event_type: string; data: PaddleSubscriptionData }
export type BillingUpdate = { tenant_id: string; status: BillingStatus; paddle_customer_id: string; paddle_subscription_id: string; current_period_end: string | null };

const PADDLE_STATUS: Record<string, BillingStatus> = { trialing: 'trialing', active: 'active', past_due: 'past_due', paused: 'paused', canceled: 'canceled' };

/** null quando o evento não é sobre uma subscrição, ou não traz o tenant_id (nada a gravar). */
export function billingUpdateFromEvent(e: PaddleEvent): BillingUpdate | null {
  if (!e.event_type.startsWith('subscription.')) return null;
  const d = e.data;
  const tenantId = d.custom_data?.tenant_id;
  const status = PADDLE_STATUS[d.status];
  if (!tenantId || !status || !d.id || !d.customer_id) return null;
  return { tenant_id: tenantId, status, paddle_customer_id: d.customer_id, paddle_subscription_id: d.id, current_period_end: d.current_billing_period?.ends_at ?? null };
}
