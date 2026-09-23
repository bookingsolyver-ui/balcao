// Mudanças: formulário do cliente, painel do negócio e acompanhamento com aceitar/recusar orçamento.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderToString } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import { MoveRequestForm } from '../src/components/store/MoveRequestForm';
import { MoveTracker } from '../src/components/store/MoveTracker';
import { MovingBoard } from '../src/components/MovingBoard';
import { DEFAULT_MOVING, type MoveRow, type MoveTrack } from '../src/lib/moving';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://x.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'sb_publishable_teste';
const messages = (l: string) => JSON.parse(readFileSync(new URL(`../messages/${l}.json`, import.meta.url), 'utf8'));
const wrap = (l: string, node: React.ReactNode) => renderToString(<NextIntlClientProvider locale={l} messages={messages(l)} timeZone="UTC">{node}</NextIntlClientProvider>).replace(/<!-- -->/g, '');
const text = (h: string) => h.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');

const moveTenant = { slug: 'mudancas-rapidas', name: 'Mudanças Rápidas', whatsapp: '351911111111', country: 'PT', timezone: 'Europe/Lisbon' };
const cfg = { ...DEFAULT_MOVING, rate_per_m3_minor: 3500, min_price_minor: 30000, per_floor_minor: 1500 };
const today = '2026-09-21';

// ---- formulário do cliente ----
const reEsc = (v: string) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
let h = wrap('pt-PT', <MoveRequestForm tenant={moveTenant} cfg={cfg} fullDays={[]} today={today} />); let tx = text(h);
assert.match(tx, /Tipo de mudança/); assert.match(tx, /Casa/); assert.match(tx, /Escritório/); assert.match(tx, /Só alguns móveis/);
assert.match(tx, /Volume estimado \(m³\)/); assert.match(tx, /Tipologia \(ajuda a estimar\)/);
for (const ty of cfg.typologies) assert.match(h, new RegExp(`<option value="${reEsc(ty.key)}">${reEsc(ty.key)} · ${ty.m3} m³</option>`), `tipologia ${ty.key}`);
assert.match(tx, /Morada de origem/); assert.match(tx, /Morada de destino/); assert.match(tx, /Elevador/); assert.match(tx, /Tem elevador/); assert.match(tx, /Sem elevador/); assert.match(tx, /Não sei/);
for (const e of cfg.extras) assert.match(tx, new RegExp(reEsc(e.name))); for (const sp of cfg.special_items) assert.match(tx, new RegExp(reEsc(sp)));
assert.match(tx, /Tenho flexibilidade de datas/); assert.match(tx, /Observações importantes/); assert.match(tx, /Autoriz[oa] o contacto/);
assert.match(tx, /Pedir orçamento/); assert.doesNotMatch(tx, /Ver política de privacidade/, 'sem link quando não configurado');
console.log('✔ formulário do cliente: tipos, tipologias, moradas, elevador, extras, itens especiais, consentimento');

h = wrap('pt-PT', <MoveRequestForm tenant={moveTenant} cfg={{ ...cfg, privacy_url: 'https://exemplo.pt/privacidade' }} fullDays={[today]} today={today} />);
assert.match(h, /href="https:\/\/exemplo\.pt\/privacidade"/); assert.match(text(h), /Ver política de privacidade/);
console.log('✔ link da política de privacidade quando configurado');

h = wrap('en', <MoveRequestForm tenant={{ ...moveTenant, country: 'US' }} cfg={DEFAULT_MOVING} fullDays={[]} today={today} />); tx = text(h);
assert.match(tx, /Request a quote/); assert.match(tx, /Pickup address/); assert.match(tx, /No elevator/); assert.match(tx, /I agree to be contacted/);
h = wrap('es', <MoveRequestForm tenant={moveTenant} cfg={DEFAULT_MOVING} fullDays={[]} today={today} />);
assert.match(text(h), /Solicitar presupuesto/); assert.match(text(h), /Dirección de origen/);
console.log('✔ formulário em inglês e espanhol');

// ---- painel do negócio ----
const row = (n: number, status: MoveRow['status'], over: Partial<MoveRow> = {}): MoveRow => ({
  id: `m${n}`, number: n, status, customer_name: 'Maria Santos', customer_phone: '351912345678', customer_email: 'maria@exemplo.pt', move_type: 'home', volume_m3: 45.5,
  origin_street: 'Rua das Flores 10', origin_city: 'Lisboa', origin_postal: '1200-123', origin_floor: 3, origin_elevator: false, origin_access: 'Rua estreita',
  dest_street: 'Avenida dos Aliados 5', dest_city: 'Porto', dest_postal: '4000-064', dest_floor: 1, dest_elevator: true, dest_access: null,
  extras: ['Embalagem'], special_items: ['Piano'], preferred_date: '2026-10-15', date_flexible: false, time_window: 'morning', notes: 'Piano de cauda no 3º andar',
  distance_km: null, quoted_minor: null, currency: 'EUR', quote_note: null, confirmed_date: null, confirmed_window: null, crew: null, internal_notes: null, lost_reason: null,
  public_token: 't', created_at: '2026-09-20T10:00:00Z', ...over,
});
const rows = [row(1001, 'new'), row(1002, 'visit', { customer_name: 'João Pires', customer_phone: '351913000001' }), row(1003, 'quoted', { quoted_minor: 95000, quote_note: 'Inclui embalagem' }), row(1004, 'accepted', { quoted_minor: 80000 }), row(1005, 'confirmed', { quoted_minor: 70000, confirmed_date: '2026-10-20', crew: 'Equipa A' }), row(1006, 'done', { quoted_minor: 60000 }), row(1007, 'lost')];
const boardTenant = { id: 't1', slug: 'mudancas-rapidas', name: 'Mudanças Rápidas', country: 'PT', currency: 'EUR', decimals: 2, timezone: 'Europe/Lisbon', whatsapp: '351911111111', locale: 'pt-PT' };
h = wrap('pt-PT', <MovingBoard tenant={boardTenant} initialRows={rows} canDownload />); tx = text(h);
assert.match(tx, /Pedidos \(5\)/); assert.match(tx, /Novos\s*1/); assert.match(tx, /Visita\s*1/); assert.match(tx, /Orçamentado\s*1/); assert.match(tx, /Aceite\s*1/); assert.match(tx, /Confirmado\s*1/);
assert.match(tx, /#1001/); assert.doesNotMatch(tx, /#1006|#1007/, 'concluído e perdido só no histórico');
assert.match(tx, /Maria Santos/); assert.match(tx, /Lisboa → Porto/); assert.match(tx, /45\.5 m³/);
assert.match(tx, /950,00\s?€/, 'orçamento em euros'); assert.match(tx, /Exportar para Excel/);
assert.match(tx, /Agendar visita/); assert.match(tx, /Enviar orçamento/); assert.match(tx, /Marcar como aceite/); assert.match(tx, /Confirmar mudança/);
console.log('✔ painel: colunas por estado, dados do pedido, preço, ações e exportação (só admin)');

h = wrap('pt-PT', <MovingBoard tenant={boardTenant} initialRows={rows} canDownload={false} />);
assert.doesNotMatch(text(h), /Exportar para Excel/, 'staff não exporta');
h = wrap('pt-PT', <MovingBoard tenant={boardTenant} initialRows={[]} canDownload />); assert.match(text(h), /Nenhum pedido ainda/);
h = wrap('en', <MovingBoard tenant={{ ...boardTenant, locale: 'en' }} initialRows={rows.slice(0, 2)} canDownload />); assert.match(text(h), /Requests \(2\)/); assert.match(text(h), /Schedule visit/);
console.log('✔ staff sem exportação; vazio; inglês');

// ---- acompanhamento: preço só aparece quando enviado, e aceitar/recusar quando "quoted" ----
const track = (status: MoveTrack['status'], over: Partial<MoveTrack> = {}): MoveTrack => ({
  number: 1003, status, move_type: 'home', volume_m3: 45.5, origin_city: 'Lisboa', dest_city: 'Porto', preferred_date: '2026-10-15', date_flexible: false, time_window: 'morning',
  confirmed_date: null, confirmed_window: null, currency: 'EUR', customer_first_name: 'Maria', quoted_minor: null, quote_note: null, can_respond: false, ...over,
});
const tenantTrack = { name: 'Mudanças Rápidas', moneyLocale: 'pt-PT', decimals: 2 };
h = wrap('pt-PT', <MoveTracker token="t" initial={track('new')} tenant={tenantTrack} />); tx = text(h);
assert.match(tx, /Recebido/); assert.match(tx, /Ainda estamos a preparar o seu orçamento/); assert.doesNotMatch(tx, /Aceitar orçamento/); assert.doesNotMatch(h, /quote-box/);
console.log('✔ acompanhamento: pedido novo não mostra preço nem botões');

h = wrap('pt-PT', <MoveTracker token="t" initial={track('quoted', { quoted_minor: 95000, quote_note: 'Inclui embalagem', can_respond: true })} tenant={tenantTrack} />); tx = text(h);
assert.match(tx, /Já temos o seu orçamento!/); assert.match(tx, /950,00\s?€/); assert.match(tx, /Inclui embalagem/); assert.match(tx, /Aceitar orçamento/); assert.match(tx, /Recusar/);
console.log('✔ acompanhamento: orçamento enviado mostra preço e ações');

h = wrap('pt-PT', <MoveTracker token="t" initial={track('accepted', { quoted_minor: 95000 })} tenant={tenantTrack} />); tx = text(h);
assert.match(tx, /Orçamento aceite\. A equipa vai confirmar a data em breve\./); assert.doesNotMatch(tx, /Aceitar orçamento/);
h = wrap('pt-PT', <MoveTracker token="t" initial={track('lost')} tenant={tenantTrack} />); assert.match(text(h), /Pedido encerrado\. Se mudar de ideias, contacte-nos\./);
h = wrap('pt-PT', <MoveTracker token="t" initial={track('confirmed', { quoted_minor: 95000, confirmed_date: '2026-10-20', confirmed_window: 'morning' })} tenant={tenantTrack} />); tx = text(h);
assert.match(tx, /Confirmado/); assert.match(tx, /Data confirmada/); assert.match(tx, /20 de outubro de 2026/); assert.match(tx, /Manhã/);
console.log('✔ acompanhamento: aceite, encerrado e confirmado com data');

h = wrap('en', <MoveTracker token="t" initial={track('quoted', { quoted_minor: 95000, can_respond: true })} tenant={{ ...tenantTrack, moneyLocale: 'en' }} />);
assert.match(text(h), /Your quote is ready!/); assert.match(text(h), /Accept quote/);
console.log('✔ acompanhamento em inglês');
process.exit(0);
