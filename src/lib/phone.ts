/**
 * Telefones no formato internacional só com dígitos (E.164 sem "+"), que é o que a base de dados
 * e o wa.me esperam. Heurística simples e previsível; em produção pode-se trocar por libphonenumber-js.
 */
export const CALLING_CODES: Record<string, string> = {
  PT: '351', BR: '55', ES: '34', FR: '33', DE: '49', IT: '39', GB: '44', IE: '353', US: '1', CA: '1',
  AO: '244', MZ: '258', CV: '238', MX: '52', AR: '54', CL: '56', CO: '57', NL: '31', BE: '32', CH: '41', JP: '81', AU: '61', PE: '51',
};

export function toE164Digits(input: string, country: string): string | null {
  const cc = CALLING_CODES[country];
  if (!cc) return null;
  const trimmed = input.trim();
  let d = trimmed.replace(/\D/g, '');
  if (!d) return null;
  if (trimmed.startsWith('+')) {
    // já internacional
  } else if (d.startsWith('00')) {
    d = d.slice(2);
  } else if (d.startsWith(cc) && d.length >= cc.length + 8) {
    // já traz o indicativo do país
  } else {
    d = cc + d.replace(/^0+/, ''); // número nacional: acrescenta o indicativo
  }
  return /^[0-9]{8,15}$/.test(d) ? d : null;
}

/** Formatação simples para mostrar: +351 912 345 678 */
export const prettyPhone = (digits: string): string => `+${digits}`;

/** Link do WhatsApp com mensagem pronta. */
export const waLink = (digits: string, text: string): string =>
  `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;

/** Mostra dígitos internacionais como "+351 912 345 678" (agrupa em blocos de 3, sem regras por país). */
export function fmtPhoneIntl(digits: string): string {
  const d = digits.replace(/\D/g, '');
  return '+' + d.replace(/(\d{3})(?=\d)/g, '$1 ');
}
