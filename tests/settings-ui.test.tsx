// Desenha o ecrã de Definições e o checkout com os pagamentos de Angola.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderToString } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import { SettingsForm } from '../src/components/SettingsForm';
import { CartProvider, type StoreInfo, type StoreItem } from '../src/components/store/CartProvider';
import { DEFAULT_CONFIG } from '../src/lib/order';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://x.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'sb_publishable_teste';
const messages = (l: string) => JSON.parse(readFileSync(new URL(`../messages/${l}.json`, import.meta.url), 'utf8'));
const wrap = (l: string, node: React.ReactNode) => renderToString(<NextIntlClientProvider locale={l} messages={messages(l)} timeZone="UTC">{node}</NextIntlClientProvider>).replace(/<!-- -->/g, '');
const text = (h: string) => h.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');

const tenant = {
  id: 't1', name: 'Perola&charme', address: 'Rua do Comércio', whatsapp: '244923306869', country: 'AO', timezone: 'Africa/Luanda', locale: 'pt-PT', currency: 'AOA', decimals: 2,
  is_published: true, modules: { menu: false, agenda: false, catalog: true, loyalty: true },
  settings: { catalog: { pickup: true, delivery: false, dine_in: false, fee_minor: 30000, min_minor: 200000, eta: '1-2 dias', payments: ['express', 'transfer', 'store'] } },
};
const hours = [1, 2, 3, 4, 5, 6, 0].map((w) => ({ weekday: w, is_open: w !== 0, opens: '10:00:00', closes: '19:00:00' }));
const countries = [{ code: 'AO', name: 'Angola' }, { code: 'PT', name: 'Portugal' }];
const props = { tenant, hours, countries, timezones: ['Africa/Luanda', 'Europe/Lisbon'], currencyName: 'kwanza angolano' };

// ---- dono: tudo editável ----
let h = wrap('pt-PT', <SettingsForm {...props} canEdit />); let tx = text(h);
assert.match(h, /value="Perola&amp;charme"/); assert.match(h, /value="\+244923306869"/, 'WhatsApp com +');
assert.match(tx, /Angola/); assert.match(tx, /kwanza angolano/); assert.match(tx, /não pode ser alterada/);
assert.match(tx, /Pedidos · Catálogo/); assert.doesNotMatch(tx, /Pedidos · Cardápio digital/, 'só módulos de pedidos ligados');
assert.match(tx, /Formas de receber/); assert.match(h, /value="300\.00"/, 'taxa em unidades da moeda'); assert.match(h, /value="2000\.00"/);
assert.match(h, /aria-pressed="true"[^>]*>Multicaixa Express/); assert.match(h, /aria-pressed="false"[^>]*>Dinheiro/);
assert.match(tx, /Pagar na loja/);
assert.match(tx, /Usar a sugestão para Angola: Multicaixa Express, Transferência, Pagar na loja/);
assert.match(tx, /Segunda-feira/); assert.doesNotMatch(tx, /Segunda-Feira/); assert.match(tx, /Domingo\s*Fechado/);
assert.equal((h.match(/type="time"/g) ?? []).length, 12, '6 dias abertos × (abre + fecha)');
assert.match(tx, /Guardar alterações/);
console.log('✔ definições: negócio, módulos, pedidos (Express / transferência / pagar na loja) e horário');

// ---- equipa: só leitura ----
h = wrap('pt-PT', <SettingsForm {...props} canEdit={false} />); tx = text(h);
assert.match(tx, /Só o proprietário e os administradores/); assert.doesNotMatch(tx, /Guardar alterações/); assert.doesNotMatch(tx, /Usar a sugestão/);
assert.ok((h.match(/disabled=""/g) ?? []).length > 10, 'campos desativados');
console.log('✔ equipa vê as definições sem poder alterar');

// ---- outros idiomas e módulo de cardápio ligado ----
h = wrap('en', <SettingsForm {...props} tenant={{ ...tenant, modules: { ...tenant.modules, menu: true } }} canEdit />); tx = text(h);
assert.match(tx, /Settings|Business name/); assert.match(tx, /Orders · Digital menu/); assert.match(tx, /Orders · Catalog/); assert.match(tx, /At the table/, 'cardápio tem "na mesa"');
assert.match(tx, /Use the suggestion for Angola: Multicaixa Express, Bank transfer, Pay in store/); assert.match(tx, /Monday/);
tx = text(wrap('es', <SettingsForm {...props} canEdit />)); assert.match(tx, /Usar la sugerencia para Angola/); assert.match(tx, /lunes|Lunes/);
console.log('✔ definições em en / es e com o cardápio ligado');

// ---- checkout: pagamentos de Angola ----
const items: StoreItem[] = [{ id: 'a', module: 'catalog', name: 'Máscara', price_minor: 990000, promo_minor: null, stock: 5, active: true, emoji: '💆' }];
const info = (over: Partial<typeof DEFAULT_CONFIG.catalog>): StoreInfo => ({ slug: 'p', name: 'Perola', whatsapp: '244923306869', country: 'AO', currency: 'AOA', decimals: 2, moneyLocale: 'pt-AO', locale: 'pt-PT',
  configs: { menu: DEFAULT_CONFIG.menu, catalog: { ...DEFAULT_CONFIG.catalog, ...over } } });
const checkout = (over: Partial<typeof DEFAULT_CONFIG.catalog>) => text(wrap('pt-PT', <CartProvider info={info(over)} items={items} module="catalog" initialCart={{ menu: [], catalog: [{ itemId: 'a', qty: 1 }] }} defaultOpen><p>x</p></CartProvider>));
tx = checkout({ pickup: true, delivery: false, payments: ['express', 'transfer', 'store'] });
assert.match(tx, /Levantar no local/); assert.match(tx, /Multicaixa Express/); assert.match(tx, /Transferência/); assert.match(tx, /Pagar na loja/, 'levantamento em loja: pagar na loja disponível');
tx = checkout({ pickup: false, delivery: true, payments: ['express', 'transfer', 'store'] });
assert.match(tx, /Multicaixa Express/); assert.doesNotMatch(tx, /Pagar na loja/, 'com entrega não há pagar na loja');
tx = checkout({ pickup: true, delivery: true, payments: ['express', 'store'] });
assert.match(tx, /Pagar na loja/, 'começa em levantar, onde pagar na loja existe');
console.log('✔ checkout: pagar na loja só em levantar/mesa; Express e transferência sempre');

// ---- só aceitar pedidos com a loja aberta ----
const closedInfo = (only: boolean, openNow: boolean): StoreInfo => ({ ...info({ only_when_open: only, pickup: true, payments: ['express'] }), openNow, statusText: 'Abre amanhã às 10:00' });
const co = (i: StoreInfo) => wrap('pt-PT', <CartProvider info={i} items={items} module="catalog" initialCart={{ menu: [], catalog: [{ itemId: 'a', qty: 1 }] }} defaultOpen><p>x</p></CartProvider>);
let hh = co(closedInfo(true, false));
assert.match(text(hh), /A loja está fechada e só aceita pedidos durante o horário de funcionamento\. Abre amanhã às 10:00/); assert.match(hh, /<button type="submit" class="btn" style="flex:1" disabled="">/, 'botão de pedir desativado');
hh = co(closedInfo(true, true)); assert.doesNotMatch(text(hh), /só aceita pedidos durante/); assert.doesNotMatch(hh, /class="btn" style="flex:1" disabled=""/);
hh = co(closedInfo(false, false)); assert.doesNotMatch(text(hh), /só aceita pedidos durante/, 'com a opção desligada aceita pedidos fechada');
console.log('✔ checkout bloqueia pedidos com a loja fechada só quando o negócio ativou a opção');

// ---- definições: opção da loja fechada e regras da agenda ----
h = wrap('pt-PT', <SettingsForm {...props} tenant={{ ...tenant, modules: { ...tenant.modules, agenda: true }, settings: { ...tenant.settings, catalog: { ...(tenant.settings.catalog as object), only_when_open: true }, agenda: { slot_step_min: 15, days_ahead: 30, min_notice_hours: 1, auto_confirm: false } } }} canEdit />); tx = text(h);
assert.match(tx, /Só aceitar pedidos com a loja aberta/); assert.match(tx, /Agenda · regras/); assert.match(tx, /Intervalo entre horários \(minutos\)/); assert.match(tx, /Confirmar marcações automaticamente/);
assert.match(h, /id="ag-step"[^>]*value="15"/); assert.match(h, /id="ag-ahead"[^>]*value="30"/); assert.match(h, /id="ag-notice"[^>]*value="1"/);
h = wrap('pt-PT', <SettingsForm {...props} canEdit />); assert.doesNotMatch(text(h), /Agenda · regras/, 'só com o módulo da agenda ligado');
console.log('✔ definições: opção da loja fechada e regras da agenda');
process.exit(0);
