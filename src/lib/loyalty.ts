import { toE164Digits } from './phone';
import { toMinor } from './money';
import { minorToInput } from './items';

export interface LoyaltyProgram { mode: 'stamps' | 'points'; goal: number; reward: string; points_per_unit: number; min_purchase_minor: number; auto_earn: boolean }
export interface LoyaltyCustomer { id: string; phone: string; name: string; balance: number; visits: number; rewards: number; total_minor: number; created_at: string }
export interface LoyaltyEvent { id: string; kind: 'join' | 'earn' | 'redeem' | 'adjust'; delta: number; note: string | null; created_at: string }
/** Resposta das funções loyalty_card / loyalty_join. */
export interface LoyaltyCardData {
  found: boolean; first_name?: string; balance?: number; mode: 'stamps' | 'points'; goal: number; reward: string; reward_ready?: boolean;
  history?: { kind: string; delta: number; note: string | null; at: string }[];
}

/* ---------- pontuar ---------- */
export interface EarnForm { phone: string; name: string; amount: string }
export interface EarnCtx { tenantId: string; country: string; currency: string; decimals: number; mode: 'stamps' | 'points'; isKnown: boolean }
export type EarnError = 'phone' | 'name' | 'amount';
export interface EarnParams { p_tenant: string; p_phone: string; p_name: string; p_amount_minor: number; p_note: string | null }

export function buildEarn(f: EarnForm, ctx: EarnCtx): { ok: true; params: EarnParams } | { ok: false; error: EarnError } {
  const phone = toE164Digits(f.phone, ctx.country);
  if (!phone) return { ok: false, error: 'phone' };
  const name = f.name.trim();
  if (!ctx.isKnown && name.length < 2) return { ok: false, error: 'name' };
  let amount = 0;
  if (f.amount.trim() !== '') {
    const m = toMinor(f.amount, ctx.currency, ctx.decimals);
    if (m === null || m < 0) return { ok: false, error: 'amount' };
    amount = m;
  }
  if (ctx.mode === 'points' && amount <= 0) return { ok: false, error: 'amount' }; // pontos dependem do valor da compra
  return { ok: true, params: { p_tenant: ctx.tenantId, p_phone: phone, p_name: name, p_amount_minor: amount, p_note: null } };
}

/* ---------- programa ---------- */
export interface ProgramForm { mode: 'stamps' | 'points'; goal: string; reward: string; rate: string; min: string; auto: boolean }
export type ProgramError = 'goal' | 'reward' | 'rate' | 'min';
export const toProgramForm = (p: LoyaltyProgram, decimals: number): ProgramForm => ({
  mode: p.mode, goal: String(p.goal), reward: p.reward, rate: String(Number(p.points_per_unit)), min: minorToInput(p.min_purchase_minor, decimals), auto: p.auto_earn,
});
export function buildProgram(f: ProgramForm, ctx: { currency: string; decimals: number }): { ok: true; value: Omit<LoyaltyProgram, never> } | { ok: false; error: ProgramError } {
  if (!/^\d{1,4}$/.test(f.goal.trim()) || Number(f.goal) < 1 || Number(f.goal) > 1000) return { ok: false, error: 'goal' };
  const reward = f.reward.trim();
  if (reward.length < 1 || reward.length > 80) return { ok: false, error: 'reward' };
  const rate = Number(f.rate.trim().replace(',', '.'));
  if (f.mode === 'points' && (!Number.isFinite(rate) || rate <= 0 || rate > 1000)) return { ok: false, error: 'rate' };
  const min = f.min.trim() === '' ? 0 : toMinor(f.min, ctx.currency, ctx.decimals);
  if (min === null || min < 0) return { ok: false, error: 'min' };
  return { ok: true, value: { mode: f.mode, goal: Number(f.goal), reward, points_per_unit: Number.isFinite(rate) && rate > 0 ? Math.round(rate * 100) / 100 : 1, min_purchase_minor: min, auto_earn: f.auto } };
}

export const progressPct = (balance: number, goal: number): number => Math.max(0, Math.min(100, Math.round((balance / Math.max(1, goal)) * 100)));
export const canRedeem = (balance: number, goal: number): boolean => balance >= goal;
