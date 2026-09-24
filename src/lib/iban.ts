/** Comprimento total (país + 2 dígitos de controlo + BBAN) por país, registo oficial ISO 13616. */
export const IBAN_LENGTHS: Record<string, number> = {
  AD: 24, AE: 23, AL: 28, AO: 25, AT: 20, AZ: 28, BA: 20, BE: 16, BG: 22, BH: 22,
  CH: 21, CR: 22, CV: 25, CY: 28, CZ: 24, DE: 22, DK: 18, DO: 28, EE: 20, EG: 29,
  ES: 24, FI: 18, FO: 18, FR: 27, GB: 22, GE: 22, GI: 23, GL: 18, GR: 27, GT: 28,
  HR: 21, HU: 28, IE: 22, IL: 23, IQ: 23, IS: 26, IT: 27, JO: 30, KW: 30, KZ: 20,
  LB: 28, LC: 32, LI: 21, LT: 20, LU: 20, LV: 21, LY: 25, MC: 27, MD: 24, ME: 22,
  MK: 19, MR: 27, MT: 31, MU: 30, MZ: 25, NL: 18, NO: 15, PK: 24, PL: 28, PS: 29,
  PT: 25, QA: 29, RO: 24, RS: 22, SA: 24, SC: 31, SE: 24, SI: 19, SK: 24, SM: 27,
  ST: 25, SV: 28, TL: 23, TN: 24, TR: 26, UA: 29, VA: 22, VG: 24, XK: 20,
};

export const normalizeIban = (raw: string): string => raw.toUpperCase().replace(/[^A-Z0-9]/g, '');

/** MOD-97 (ISO 7064): reorganiza, troca letras por números (A=10…Z=35), e confirma resto 1. Sem BigInt nativo — string a string. */
function mod97(digits: string): number {
  let rem = 0;
  for (const ch of digits) rem = (rem * 10 + Number(ch)) % 97;
  return rem;
}
export function isValidIban(raw: string): boolean {
  const v = normalizeIban(raw);
  if (!/^[A-Z]{2}[0-9A-Z]+$/.test(v)) return false;
  const expected = IBAN_LENGTHS[v.slice(0, 2)];
  if (!expected || v.length !== expected) return false;
  const rearranged = v.slice(4) + v.slice(0, 4);
  const digits = [...rearranged].map((c) => (c >= 'A' && c <= 'Z' ? String(c.charCodeAt(0) - 55) : c)).join('');
  return mod97(digits) === 1;
}
/** Agrupa de 4 em 4 para leitura ("AO06 0040 0000...") — só para mostrar; a base de dados guarda sempre sem espaços. */
export const formatIban = (raw: string): string => normalizeIban(raw).replace(/(.{4})/g, '$1 ').trim();
