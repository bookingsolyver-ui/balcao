import { CALLING_CODES } from './phone';

export type UiLocale = 'pt-PT' | 'pt-BR' | 'en' | 'es';

export interface CountryInfo {
  code: string;      // ISO 3166-1 alpha-2
  currency: string;  // ISO 4217
  timezone: string;  // IANA (tem de existir no Postgres)
  locale: UiLocale;  // idioma sugerido para a loja
}

/** Predefinições por país. O utilizador pode alterar tudo no onboarding. */
export const COUNTRIES: CountryInfo[] = [
  { code: 'PT', currency: 'EUR', timezone: 'Europe/Lisbon', locale: 'pt-PT' },
  { code: 'BR', currency: 'BRL', timezone: 'America/Sao_Paulo', locale: 'pt-BR' },
  { code: 'ES', currency: 'EUR', timezone: 'Europe/Madrid', locale: 'es' },
  { code: 'FR', currency: 'EUR', timezone: 'Europe/Paris', locale: 'en' },
  { code: 'DE', currency: 'EUR', timezone: 'Europe/Berlin', locale: 'en' },
  { code: 'IT', currency: 'EUR', timezone: 'Europe/Rome', locale: 'en' },
  { code: 'NL', currency: 'EUR', timezone: 'Europe/Amsterdam', locale: 'en' },
  { code: 'BE', currency: 'EUR', timezone: 'Europe/Brussels', locale: 'en' },
  { code: 'IE', currency: 'EUR', timezone: 'Europe/Dublin', locale: 'en' },
  { code: 'GB', currency: 'GBP', timezone: 'Europe/London', locale: 'en' },
  { code: 'CH', currency: 'CHF', timezone: 'Europe/Zurich', locale: 'en' },
  { code: 'US', currency: 'USD', timezone: 'America/New_York', locale: 'en' },
  { code: 'CA', currency: 'CAD', timezone: 'America/Toronto', locale: 'en' },
  { code: 'MX', currency: 'MXN', timezone: 'America/Mexico_City', locale: 'es' },
  { code: 'AR', currency: 'ARS', timezone: 'America/Argentina/Buenos_Aires', locale: 'es' },
  { code: 'CL', currency: 'CLP', timezone: 'America/Santiago', locale: 'es' },
  { code: 'CO', currency: 'COP', timezone: 'America/Bogota', locale: 'es' },
  { code: 'PE', currency: 'PEN', timezone: 'America/Lima', locale: 'es' },
  { code: 'AO', currency: 'AOA', timezone: 'Africa/Luanda', locale: 'pt-PT' },
  { code: 'MZ', currency: 'MZN', timezone: 'Africa/Maputo', locale: 'pt-PT' },
  { code: 'CV', currency: 'CVE', timezone: 'Atlantic/Cape_Verde', locale: 'pt-PT' },
  { code: 'JP', currency: 'JPY', timezone: 'Asia/Tokyo', locale: 'en' },
  { code: 'AU', currency: 'AUD', timezone: 'Australia/Sydney', locale: 'en' },
];

export const CURRENCIES = [...new Set(COUNTRIES.map((c) => c.currency))].sort();

export const countryInfo = (code: string): CountryInfo | undefined => COUNTRIES.find((c) => c.code === code);

/** Nome do país no idioma da interface (sem tabelas de tradução manuais). */
export function countryName(code: string, uiLocale: string): string {
  try { return new Intl.DisplayNames([uiLocale], { type: 'region' }).of(code) ?? code; } catch { return code; }
}
export function currencyName(code: string, uiLocale: string): string {
  try { return new Intl.DisplayNames([uiLocale], { type: 'currency' }).of(code) ?? code; } catch { return code; }
}

export const hasCallingCode = (code: string): boolean => code in CALLING_CODES;
