// Cartão de subscrição: estados de faturação, contagem da avaliação, e os dois casos de configuração do Paddle.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderToString } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import { BillingCard } from '../src/components/BillingCard';
import type { BillingRow } from '../src/lib/billing';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://x.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'sb_publishable_teste';
const messages = (l: string) => JSON.parse(readFileSync(new URL(`../messages/${l}.json`, import.meta.url), 'utf8'));
const wrap = (l: string, node: React.ReactNode) => renderToString(<NextIntlClientProvider locale={l} messages={messages(l)} timeZone="UTC">{node}</NextIntlClientProvider>).replace(/<!-- -->/g, '');
const text = (h: string) => h.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');

const row = (over: Partial<BillingRow> = {}): BillingRow => ({ tenant_id: 't1', status: 'trialing', plan: 'standard', paddle_customer_id: null, paddle_subscription_id: null, trial_ends_at: null, current_period_end: null, ...over });
const inDays = (n: number) => new Date(Date.now() + n * 86400000).toISOString();

// ---- sem as variáveis do Paddle configuradas (o caso de hoje) ----
delete process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN; delete process.env.NEXT_PUBLIC_PADDLE_PRICE_ID;
let h = wrap('pt-PT', <BillingCard billing={row({ trial_ends_at: inDays(9) })} tenantId="t1" />); let tx = text(h);
assert.match(tx, /Assinatura/); assert.match(tx, /Em avaliação/); assert.match(tx, /Faltam 9 dias de avaliação/); assert.match(tx, /Pagamentos ainda não configurados para este Balcão/);
assert.doesNotMatch(tx, /Subscrever/, 'sem configuração, não mostra botão de subscrever');
console.log('✔ sem Paddle configurado: mostra o aviso, não o botão');

h = wrap('pt-PT', <BillingCard billing={row({ trial_ends_at: inDays(1) })} tenantId="t1" />); assert.match(text(h), /Falta 1 dia de avaliação/, 'singular: último dia');
h = wrap('pt-PT', <BillingCard billing={row({ trial_ends_at: new Date(Date.now() - 86400000).toISOString() })} tenantId="t1" />); tx = text(h);
assert.match(tx, /Avaliação terminada/); assert.match(tx, /O período de avaliação terminou\. Subscreva para continuar a usar o Balcão\./);
assert.doesNotMatch(tx, /Faltam|Falta \d/, 'expirada: não mostra contagem, só o aviso');
console.log('✔ contagem da avaliação: plural, último dia (singular) e expirada');

h = wrap('pt-PT', <BillingCard billing={row({ status: 'active', current_period_end: '2026-11-24T12:00:00Z' })} tenantId="t1" />); tx = text(h);
assert.match(tx, /Ativa/); assert.match(tx, /Renova a 24 de novembro de 2026/); assert.doesNotMatch(tx, /Subscrever|não configurados/, 'já ativa: sem botão nem aviso de configuração');
h = wrap('pt-PT', <BillingCard billing={row({ status: 'past_due' })} tenantId="t1" />); assert.match(text(h), /Pagamento em atraso/); assert.match(text(h), /O último pagamento falhou/);
h = wrap('pt-PT', <BillingCard billing={row({ status: 'canceled' })} tenantId="t1" />); assert.match(text(h), /Cancelada/); assert.match(text(h), /A subscrição foi cancelada\./);
h = wrap('pt-PT', <BillingCard billing={row({ status: 'paused' })} tenantId="t1" />); assert.match(text(h), /Em pausa/); assert.match(text(h), /A subscrição está em pausa\./);
console.log('✔ estados: ativa (sem botão), pagamento em atraso, cancelada, em pausa');

h = wrap('pt-PT', <BillingCard billing={null} tenantId="t1" />); assert.match(text(h), /Em avaliação/, 'sem registo ainda: assume avaliação, nunca bloqueia');
console.log('✔ sem registo de faturação ainda: não quebra, assume avaliação');

// ---- com as variáveis do Paddle configuradas ----
process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN = 'live_teste'; process.env.NEXT_PUBLIC_PADDLE_PRICE_ID = 'pri_teste';
h = wrap('pt-PT', <BillingCard billing={row({ trial_ends_at: inDays(5) })} tenantId="t1" />); tx = text(h);
assert.doesNotMatch(tx, /não configurados/); assert.match(tx, /A carregar…/, 'em SSR o script do Paddle ainda não correu, por isso mostra "a carregar"');
assert.match(h, /<button class="btn sm"[^>]*disabled=""/, 'botão existe mas começa desativado até o Paddle carregar');
console.log('✔ com Paddle configurado: botão presente (desativado até o script carregar)');
delete process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN; delete process.env.NEXT_PUBLIC_PADDLE_PRICE_ID;

// ---- outros idiomas ----
h = wrap('en', <BillingCard billing={row({ trial_ends_at: inDays(3) })} tenantId="t1" />); assert.match(text(h), /3 days left in trial/);
h = wrap('es', <BillingCard billing={row({ status: 'past_due' })} tenantId="t1" />); assert.match(text(h), /Pago pendiente/);
h = wrap('pt-BR', <BillingCard billing={row({ status: 'active', current_period_end: '2026-11-24T12:00:00Z' })} tenantId="t1" />); assert.match(text(h), /Ativa/);
console.log('✔ faturação em inglês, espanhol e português do Brasil');
process.exit(0);
