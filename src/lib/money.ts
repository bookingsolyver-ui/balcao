/**
 * Dinheiro universal.
 * Regra de ouro: guardar SEMPRE inteiros na menor unidade (cêntimos) + código ISO 4217.
 * Nunca guardar floats. As casas decimais vêm do Intl (EUR/USD/BRL = 2, JPY = 0, KWD = 3).
 */
export function decimalsFor(currency: string, locale = 'en'): number {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2;
}

/**
 * "12,50" | "12.50" | 12.5  ->  1250 (EUR)  ·  "1500" -> 1500 (JPY). Devolve null se inválido.
 * `decimals`: use SEMPRE tenants.currency_decimals quando existir; o Intl pode variar entre aparelhos.
 */
export function toMinor(input: string | number, currency: string, decimals?: number): number | null {
  const d = decimals ?? decimalsFor(currency);
  const raw = String(input).trim().replace(/\s/g, '');
  if (!/^-?\d+([.,]\d+)?$/.test(raw)) return null;
  const neg = raw.startsWith('-');
  const [int, frac = ''] = raw.replace('-', '').replace(',', '.').split('.');
  const padded = (frac + '0'.repeat(d)).slice(0, d);
  let minor = Number(int) * 10 ** d + (padded ? Number(padded) : 0);
  if (frac.length > d && Number(frac[d]) >= 5) minor += 1; // arredonda meio para cima
  return neg ? -minor : minor;
}

/**
 * 1250 + "EUR" + "pt-PT" -> "12,50 €"  ·  1250 + "BRL" + "pt-BR" -> "R$ 12,50"
 * `decimals`: casas decimais guardadas no negócio (tenants.currency_decimals). Se omitido, usa o Intl.
 * Formatar sempre com as casas guardadas evita que o mesmo preço apareça diferente em aparelhos diferentes.
 */
export function formatMoney(minor: number, currency: string, locale: string, decimals?: number): string {
  const d = decimals ?? decimalsFor(currency, locale);
  // useGrouping 'always': o pt-PT só agrupa milhares a partir de 5 dígitos (9900,00 vs 12 000,00), o que parece inconsistente.
  const opts: Record<string, unknown> = { style: 'currency', currency, minimumFractionDigits: d, maximumFractionDigits: d, useGrouping: 'always' };
  return new Intl.NumberFormat(locale, opts as Intl.NumberFormatOptions).format(minor / 10 ** d);
}

const PT_COUNTRIES = ['PT', 'BR', 'AO', 'MZ', 'CV'];
/**
 * Em português, formata o dinheiro à maneira do país do negócio (AO -> "9 900,00 Kz", BR -> "R$ 9.900,00").
 * Nos outros idiomas mantém o do visitante. Só usa países com locale português próprio (senão o Intl cai no pt-BR).
 */
export function moneyLocale(uiLocale: string, country: string): string {
  return uiLocale.startsWith('pt') && PT_COUNTRIES.includes(country) ? `pt-${country}` : uiLocale;
}

/** Pontos de fidelidade: floor(valor em unidades × pontos por unidade). */
export function pointsFor(amountMinor: number, currency: string, perUnit: number, decimals?: number): number {
  return Math.floor((amountMinor / 10 ** (decimals ?? decimalsFor(currency))) * perUnit);
}
