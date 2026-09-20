// Corre o onboarding contra o Postgres real com EXATAMENTE os parâmetros que o formulário envia, para cada país.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { makeDb, asUser } from './helpers/pg';
import { COUNTRIES } from '../src/lib/countries';
import { decimalsFor } from '../src/lib/money';
import { toE164Digits } from '../src/lib/phone';
import { slugify } from '../src/lib/slug';
import { dbErrorKey } from '../src/lib/errors';

const db = await makeDb();
const sample: Record<string, string> = { PT: '912345678', BR: '11999990000', ES: '612345678', FR: '612345678', DE: '15123456789', IT: '3123456789' };
let n = 0;

// um utilizador por país (o limite é 5 negócios por conta)
for (const c of COUNTRIES) {
  const uid = randomUUID();
  await db.query('insert into auth.users(id) values ($1)', [uid]);
  const name = `Negócio ${c.code} ${++n}`;
  const params = {
    p_slug: slugify(name), p_name: name, p_niche: 'restaurant', p_currency: c.currency, p_currency_decimals: decimalsFor(c.currency),
    p_locale: c.locale, p_timezone: c.timezone, p_country: c.code, p_whatsapp: toE164Digits(sample[c.code] ?? '612345678', c.code),
  };
  const r = await asUser(db, uid, () => db.query(
    'select create_tenant($1,$2,$3,$4,$5,$6,$7,$8,$9) id',
    [params.p_slug, params.p_name, params.p_niche, params.p_currency, params.p_currency_decimals, params.p_locale, params.p_timezone, params.p_country, params.p_whatsapp]));
  const t = (await db.query<{ currency: string; currency_decimals: number; timezone: string; locale: string }>('select * from tenants where id=$1', [(r.rows[0] as { id: string }).id])).rows[0];
  assert.equal(t.currency, c.currency, `${c.code} moeda`);
  assert.equal(t.timezone, c.timezone, `${c.code} fuso`);
  assert.equal(t.locale, c.locale, `${c.code} idioma`);
}
console.log(`✔ onboarding aceito pela base de dados nos ${COUNTRIES.length} países (moeda, fuso, idioma, WhatsApp)`);

// cada nicho liga os módulos certos
const owner = randomUUID(); await db.query('insert into auth.users(id) values ($1)', [owner]);
const expected: Record<string, string[]> = { restaurant: ['loyalty', 'menu'], salon: ['agenda', 'loyalty'], beauty_store: ['catalog', 'loyalty'], general: ['catalog', 'loyalty'] };
for (const [niche, mods] of Object.entries(expected)) {
  const id = (await asUser(db, owner, () => db.query<{ id: string }>('select create_tenant($1,$2,$3) id', [`loja-${niche.replace('_', '-')}`, `Loja ${niche}`, niche]))).rows[0].id;
  const m = (await db.query<{ modules: Record<string, boolean> }>('select modules from tenants where id=$1', [id])).rows[0].modules;
  assert.deepEqual(Object.keys(m).filter((k) => m[k]).sort(), mods, `módulos do nicho ${niche}`);
}
console.log('✔ cada nicho liga os módulos certos');

// os erros reais da base de dados são traduzidos para as chaves que a interface conhece
async function err(fn: () => Promise<unknown>) { try { await fn(); return null; } catch (e) { return e as { code?: string; message?: string }; } }
const dup = await asUser(db, owner, () => err(() => db.query(`select create_tenant('loja-salon','Outra')`)));
assert.equal(dup?.code, '23505'); assert.equal(dbErrorKey(dup), 'slug_taken');
const bad = await asUser(db, owner, () => err(() => db.query(`select create_tenant('a--','Xx')`)));
assert.equal(dbErrorKey(bad), 'invalid_data', `slug inválido: ${bad?.code}`);
const tz = await asUser(db, owner, () => err(() => db.query(`select create_tenant('fuso-mau','Fuso','general','EUR',2,'pt-PT','Marte/Olimpo')`)));
assert.equal(dbErrorKey(tz), 'invalid_timezone');
const nich = await asUser(db, owner, () => err(() => db.query(`select create_tenant('nicho-mau','Nicho','inexistente')`)));
assert.equal(dbErrorKey(nich), 'invalid_niche');
const anon = await asUser(db, 'anon', () => err(() => db.query(`select create_tenant('anon-loja','Anon')`)));
assert.ok(anon, 'anónimo não cria negócio');
// limite de 5 negócios por conta (o dono já tem 4)
await asUser(db, owner, () => db.query(`select create_tenant('quinto-negocio','Quinto')`));
const lim = await asUser(db, owner, () => err(() => db.query(`select create_tenant('sexto-negocio','Sexto')`)));
assert.equal(dbErrorKey(lim), 'tenant_limit');
console.log('✔ erros reais da base de dados → chaves de tradução (slug repetido, formato, fuso, nicho, limite)');
process.exit(0);
