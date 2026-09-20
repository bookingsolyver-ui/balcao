/**
 * Dinheiro universal.
 * Regra de ouro: guardar SEMPRE inteiros na menor unidade (cêntimos) + código ISO 4217.
 * Nunca guardar floats. As casas decimais vêm do Intl (EUR/USD/BRL = 2, JPY = 0, KWD = 3).
 */
export function decimalsFor(currency: string, locale = 'en'): number {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2;
}

/** "12,50" | "12.50" | 12.5  ->  1250 (EUR)  ·  "1500" -> 1500 (JPY). Devolve null se inválido. */
export function toMinor(input: string | number, currency: string): number | null {
  const d = decimalsFor(currency);
  const raw = String(input).trim().replace(/\s/g, '');
  if (!/^-?\d+([.,]\d+)?$/.test(raw)) return null;
  const neg = raw.startsWith('-');
  const [int, frac = ''] = raw.replace('-', '').replace(',', '.').split('.');
  const padded = (frac + '0'.repeat(d)).slice(0, d);
  let minor = Number(int) * 10 ** d + (padded ? Number(padded) : 0);
  if (frac.length > d && Number(frac[d]) >= 5) minor += 1; // arredonda meio para cima
  return neg ? -minor : minor;
}

/** 1250 + "EUR" + "pt-PT" -> "12,50 €"  ·  1250 + "BRL" + "pt-BR" -> "R$ 12,50" */
export function formatMoney(minor: number, currency: string, locale: string): string {
  const d = decimalsFor(currency, locale);
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(minor / 10 ** d);
}

/** Pontos de fidelidade: floor(valor em unidades × pontos por unidade). */
export function pointsFor(amountMinor: number, currency: string, perUnit: number): number {
  return Math.floor((amountMinor / 10 ** decimalsFor(currency)) * perUnit);
}
