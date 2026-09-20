import { PAY_METHODS, type Fulfillment } from './order';

/** Formas de pagamento sugeridas por país (o dono pode alterar nas Definições). */
export const SUGGESTED_PAYMENTS: Record<string, string[]> = {
  AO: ['express', 'transfer', 'store'],   // Multicaixa Express, transferência, pagar na loja ao levantar
  PT: ['mbway', 'card', 'cash', 'transfer'],
  BR: ['pix', 'card', 'cash'],
  MZ: ['transfer', 'cash', 'store'],
  CV: ['transfer', 'cash', 'card'],
};
export const DEFAULT_SUGGESTED = ['cash', 'card', 'transfer'];
export const suggestedPayments = (country: string): string[] => SUGGESTED_PAYMENTS[country] ?? DEFAULT_SUGGESTED;

/** Métodos que o cliente pode usar para cada forma de receber ("pagar na loja" não existe em entregas). */
export function paymentsFor(cfg: { payments: string[] }, fulfillment: Fulfillment): string[] {
  return cfg.payments.filter((p) => (PAY_METHODS as string[]).includes(p) && (p !== 'store' || fulfillment !== 'delivery'));
}
