// Desenha a fidelidade: painel do negócio e cartão do cliente.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderToString } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import { LoyaltyManager } from '../src/components/LoyaltyManager';
import { LoyaltyCard } from '../src/components/store/LoyaltyCard';
import type { LoyaltyCardData, LoyaltyCustomer, LoyaltyProgram } from '../src/lib/loyalty';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://x.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'sb_publishable_teste';
const messages = (l: string) => JSON.parse(readFileSync(new URL(`../messages/${l}.json`, import.meta.url), 'utf8'));
const wrap = (l: string, node: React.ReactNode) => renderToString(<NextIntlClientProvider locale={l} messages={messages(l)} timeZone="UTC">{node}</NextIntlClientProvider>).replace(/<!-- -->/g, '');
const text = (h: string) => h.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');

const prog: LoyaltyProgram = { mode: 'stamps', goal: 6, reward: '1 corte grátis', points_per_unit: 1, min_purchase_minor: 0, auto_earn: true };
const cust = (over: Partial<LoyaltyCustomer>): LoyaltyCustomer => ({ id: 'c', phone: '244923306869', name: 'Ana Silva', balance: 2, visits: 3, rewards: 0, total_minor: 1500000, created_at: '2026-09-01T10:00:00Z', ...over });
const customers = [cust({ id: 'c1', name: 'Ana Silva', balance: 6, rewards: 1 }), cust({ id: 'c2', name: 'Rui Costa', phone: '244923111222', balance: 2 })];
const tenant = { id: 't1', country: 'AO', currency: 'AOA', decimals: 2, moneyLocale: 'pt-AO' };

// ---- painel ----
let h = wrap('pt-PT', <LoyaltyManager tenant={tenant} program={prog} initialCustomers={customers} canAdmin />); let tx = text(h);
assert.match(tx, /Dar carimbo/); assert.match(tx, /Cada compra vale 1 carimbo/); assert.match(tx, /Adicionar carimbo/);
assert.match(tx, /Clientes\s*2/); assert.match(tx, /Prémios liberados\s*1/); assert.match(tx, /Prémios resgatados\s*1/);
assert.match(tx, /Ana Silva/); assert.match(tx, /\+244 923 306 869/); assert.match(tx, /6 \/ 6/); assert.match(tx, /2 \/ 6/);
assert.equal((h.match(/>Resgatar</g) ?? []).length, 1, 'só quem atingiu a meta tem "Resgatar"');
assert.match(tx, /15\s000,00\s?Kz/, 'total gasto em kwanzas');
assert.match(tx, /Programa/); assert.match(tx, /Guardar programa/); assert.match(tx, /Ajustar/);
console.log('✔ painel de fidelidade: pontuar, estatísticas, resgate só com meta atingida, programa');

// staff: pontua e resgata, mas não ajusta nem edita o programa
h = wrap('pt-PT', <LoyaltyManager tenant={tenant} program={prog} initialCustomers={customers} canAdmin={false} />); tx = text(h);
assert.match(tx, /Adicionar carimbo/); assert.match(tx, /Resgatar/); assert.doesNotMatch(tx, /Guardar programa/); assert.doesNotMatch(tx, /Ajustar/);
console.log('✔ staff sem ajuste nem edição do programa');

// modo pontos
h = wrap('pt-PT', <LoyaltyManager tenant={tenant} program={{ ...prog, mode: 'points', goal: 100, points_per_unit: 0.01 }} initialCustomers={[]} canAdmin />); tx = text(h);
assert.match(tx, /Pontuar compra/); assert.match(tx, /Cada 1 AOA vale 0,01 pontos/); assert.match(tx, /Valor da compra \(AOA\)/); assert.match(tx, /Ainda não há clientes/);
assert.match(tx, /Pontos para o prémio/); assert.match(tx, /Pontos por 1 AOA gasto/);
console.log('✔ modo pontos e lista vazia');

// idiomas
tx = text(wrap('en', <LoyaltyManager tenant={tenant} program={prog} initialCustomers={customers} canAdmin />)); assert.match(tx, /Give a stamp/); assert.match(tx, /Rewards unlocked\s*1/);
tx = text(wrap('es', <LoyaltyManager tenant={tenant} program={prog} initialCustomers={customers} canAdmin />)); assert.match(tx, /Dar sello/); assert.match(tx, /Canjear/);
tx = text(wrap('pt-BR', <LoyaltyManager tenant={tenant} program={prog} initialCustomers={customers} canAdmin />)); assert.match(tx, /Prêmios liberados/);
console.log('✔ fidelidade em en / es / pt-BR');

// ---- cartão do cliente ----
const cardProps = { slug: 'salao', tenantName: 'Salão Bela', country: 'AO', currency: 'AOA', program: { mode: 'stamps' as const, goal: 6, reward: '1 corte grátis', points_per_unit: 1 } };
h = wrap('pt-PT', <LoyaltyCard {...cardProps} />); tx = text(h);
assert.match(tx, /Cartão de fidelidade/); assert.match(tx, /Junte 6 carimbos e ganhe: 1 corte grátis/); assert.match(tx, /Ver o meu cartão/);
h = wrap('pt-PT', <LoyaltyCard {...cardProps} program={{ mode: 'points', goal: 100, reward: 'Vale', points_per_unit: 1 }} />); assert.match(text(h), /Cada 1 AOA gasto vale 1 ponto\./, 'singular');
const card = (over: Partial<LoyaltyCardData>): LoyaltyCardData => ({ found: true, first_name: 'Ana', balance: 3, mode: 'stamps', goal: 6, reward: '1 corte grátis', reward_ready: false, history: [{ kind: 'earn', delta: 1, note: 'purchase', at: '2026-09-18T10:00:00Z' }, { kind: 'join', delta: 0, note: 'join', at: '2026-09-01T10:00:00Z' }], ...over });
h = wrap('pt-PT', <LoyaltyCard {...cardProps} initialCard={card({})} />); tx = text(h);
assert.match(tx, /Olá, Ana/); assert.match(tx, /Faltam 3 carimbos/); assert.match(tx, /3 \/ 6/);
assert.equal((h.match(/class="stamp on/g) ?? []).length, 3, '3 carimbos preenchidos'); assert.equal((h.match(/class="stamp /g) ?? []).length, 6, '6 casas');
assert.match(tx, /Atividade/); assert.match(tx, /Pontuação/); assert.match(tx, /Cartão criado/); assert.match(tx, /Prémio: 1 corte grátis/); assert.match(tx, /Não é você\? Sair/);
h = wrap('pt-PT', <LoyaltyCard {...cardProps} initialCard={card({ balance: 6, reward_ready: true })} />); tx = text(h);
assert.match(tx, /Prémio liberado!/); assert.match(tx, /Mostre este cartão no balcão para resgatar: 1 corte grátis/);
h = wrap('pt-PT', <LoyaltyCard {...cardProps} initialCard={card({ mode: 'points', goal: 100, balance: 40 })} />); tx = text(h);
assert.match(h, /role="progressbar"/); assert.doesNotMatch(h, /class="stamp/); assert.match(tx, /Faltam 60 pontos/); assert.match(tx, /40 \/ 100/);
h = wrap('pt-PT', <LoyaltyCard {...cardProps} initialCard={card({ balance: 1 })} />); assert.match(text(h), /Faltam 5 carimbos/);
h = wrap('en', <LoyaltyCard {...cardProps} initialCard={card({ balance: 5 })} />); assert.match(text(h), /Hi, Ana/); assert.match(text(h), /1 stamp to go/, 'singular em inglês');
console.log('✔ cartão do cliente: formulário, carimbos, pronto para resgatar, pontos e singular/plural');
process.exit(0);
