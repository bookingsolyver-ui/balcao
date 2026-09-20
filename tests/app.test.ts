import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { slugify, isValidSlug } from '../src/lib/slug';
import { COUNTRIES, CURRENCIES, hasCallingCode } from '../src/lib/countries';
import { openStatus, type HourRow } from '../src/lib/hours';
import { dbErrorKey, authErrorKey } from '../src/lib/errors';
import { decimalsFor, formatMoney, moneyLocale, toMinor } from '../src/lib/money';
import { fmtPhoneIntl, toE164Digits } from '../src/lib/phone';

// ---- slug ----
assert.equal(slugify('Café Aurora'), 'cafe-aurora');
assert.equal(slugify('  Salão da Bela!! '), 'salao-da-bela');
assert.equal(slugify('Ação & Reação'), 'acao-reacao');
assert.equal(slugify('x'.repeat(80)).length, 40);
assert.equal(isValidSlug('cafe-aurora'), true);
assert.equal(isValidSlug('a'), false);
assert.equal(isValidSlug('admin'), false);
assert.equal(isValidSlug('-abc'), false);
assert.equal(isValidSlug('Cafe'), false);
assert.equal(isValidSlug('a--b'), false);

// ---- países: moeda, fuso e indicativo têm de ser válidos (a BD rejeita fusos desconhecidos) ----
for (const c of COUNTRIES) {
  assert.doesNotThrow(() => new Intl.NumberFormat('en', { style: 'currency', currency: c.currency }), `moeda ${c.currency}`);
  assert.doesNotThrow(() => new Intl.DateTimeFormat('en', { timeZone: c.timezone }), `fuso ${c.timezone}`);
  assert.ok(hasCallingCode(c.code), `indicativo de ${c.code}`);
  assert.ok(['pt-PT', 'pt-BR', 'en', 'es'].includes(c.locale));
}
assert.equal(new Set(COUNTRIES.map((c) => c.code)).size, COUNTRIES.length, 'países duplicados');
assert.equal(decimalsFor('JPY'), 0); assert.equal(decimalsFor('EUR'), 2); assert.equal(decimalsFor('BRL'), 2);
assert.ok(CURRENCIES.includes('COP'));
// casas decimais guardadas no negócio mandam sobre o Intl (que varia entre aparelhos)
assert.match(formatMoney(150000, 'COP', 'es', 2), /1\.500,00/);
assert.match(formatMoney(1500, 'COP', 'es', 0), /1\.500/);
// milhares sempre agrupados (o pt-PT por defeito não agrupa 4 dígitos: "9900,00")
assert.match(formatMoney(990000, 'AOA', 'pt-PT', 2), /^9\s900,00/);
assert.match(formatMoney(1200000, 'AOA', 'pt-PT', 2), /^12\s000,00/);
// locale monetário do país do negócio (só países lusófonos, em português)
assert.equal(moneyLocale('pt-PT', 'AO'), 'pt-AO'); assert.equal(moneyLocale('pt-BR', 'PT'), 'pt-PT');
assert.equal(moneyLocale('pt-PT', 'JP'), 'pt-PT'); assert.equal(moneyLocale('en', 'AO'), 'en'); assert.equal(moneyLocale('es', 'MX'), 'es');
assert.match(formatMoney(990000, 'AOA', moneyLocale('pt-PT', 'AO'), 2), /9\s900,00\s?Kz/);
assert.match(formatMoney(1250, 'BRL', moneyLocale('pt-PT', 'BR'), 2), /R\$\s?12,50/);
assert.match(formatMoney(1250, 'EUR', moneyLocale('pt-PT', 'PT'), 2), /12,50\s?€/);
assert.equal(toMinor('1500', 'COP', 2), 150000);
assert.equal(toMinor('1500', 'COP', 0), 1500);
assert.equal(toE164Digits('912345678', 'PT'), '351912345678');
assert.equal(fmtPhoneIntl('351912345678'), '+351 912 345 678');

// ---- horário de funcionamento no fuso do negócio ----
const hours: HourRow[] = [0, 1, 2, 3, 4, 5, 6].map((d) => ({ weekday: d, is_open: d !== 0, opens: '09:00:00', closes: '18:00:00' }));
// 2026-09-21 é segunda-feira. 10:00 em Lisboa (UTC+1 no verão) = 09:00Z
let s = openStatus(hours, 'Europe/Lisbon', new Date('2026-09-21T09:00:00Z'));
assert.equal(s.open, true); assert.equal(s.closesAt, '18:00');
// mesma hora UTC em Tóquio já é 18:00 -> fechado, abre amanhã
s = openStatus(hours, 'Asia/Tokyo', new Date('2026-09-21T09:00:00Z'));
assert.equal(s.open, false); assert.deepEqual(s.next, { dayOffset: 1, weekday: 2, opens: '09:00' });
// segunda 07:30 Lisboa (06:30Z): fechado, abre hoje
s = openStatus(hours, 'Europe/Lisbon', new Date('2026-09-21T06:30:00Z'));
assert.equal(s.open, false); assert.equal(s.next?.dayOffset, 0);
// sábado à noite com domingo fechado: próxima abertura segunda (dayOffset 2)
s = openStatus(hours, 'Europe/Lisbon', new Date('2026-09-26T20:00:00Z'));
assert.equal(s.open, false); assert.equal(s.next?.weekday, 1); assert.equal(s.next?.dayOffset, 2);
// tudo fechado
assert.equal(openStatus(hours.map((h) => ({ ...h, is_open: false })), 'Europe/Lisbon').next, undefined);

// ---- erros ----
assert.equal(dbErrorKey({ message: 'tenant_limit' }), 'tenant_limit');
assert.equal(dbErrorKey({ code: '23505', message: 'duplicate key' }), 'slug_taken');
assert.equal(dbErrorKey({ code: '23514' }), 'invalid_data');
assert.equal(dbErrorKey({ message: '???' }), 'generic');
assert.equal(authErrorKey({ code: 'invalid_credentials' }), 'invalid_credentials');
assert.equal(authErrorKey({ message: 'User already registered' }), 'email_in_use');
assert.equal(authErrorKey({ status: 429 }), 'rate_limit');

// ---- traduções: mesmas chaves nos 4 idiomas, sem valores vazios ----
const flat = (o: unknown, p = ''): string[] => typeof o === 'object' && o
  ? Object.entries(o as Record<string, unknown>).flatMap(([k, v]) => flat(v, p ? `${p}.${k}` : k)) : [p];
const load = (l: string) => JSON.parse(readFileSync(new URL(`../messages/${l}.json`, import.meta.url), 'utf8'));
const base = flat(load('pt-PT')).sort();
for (const l of ['pt-BR', 'en', 'es']) assert.deepEqual(flat(load(l)).sort(), base, `chaves em falta/sobram em ${l}`);
const leaves = (o: unknown): string[] => typeof o === 'object' && o ? Object.values(o as object).flatMap(leaves) : [String(o)];
for (const l of ['pt-PT', 'pt-BR', 'en', 'es']) assert.ok(leaves(load(l)).every((v) => v.trim().length > 0), `valor vazio em ${l}`);
// todas as mensagens de erro da BD usadas pela interface existem
const errs = Object.keys(load('pt-PT').onboarding.errors);
for (const k of ['slug_taken', 'invalid_slug', 'invalid_data', 'tenant_limit', 'invalid_timezone', 'invalid_niche', 'not_authenticated', 'forbidden', 'generic']) assert.ok(errs.includes(k), `onboarding.errors.${k}`);
const aerrs = Object.keys(load('pt-PT').auth.errors);
for (const k of ['invalid_credentials', 'weak_password', 'email_in_use', 'email_not_confirmed', 'rate_limit', 'generic']) assert.ok(aerrs.includes(k), `auth.errors.${k}`);

console.log('✔ lógica da aplicação OK (slug, países, horário, erros, traduções)');
