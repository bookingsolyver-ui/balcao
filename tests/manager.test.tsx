// Desenha o ecrã de gestão de itens (renderização no servidor) e confirma o que o utilizador vê.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderToString } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import { ItemsManager } from '../src/components/ItemsManager';
import type { Category, Item } from '../src/lib/types';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://x.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'sb_publishable_teste';
const messages = (l: string) => JSON.parse(readFileSync(new URL(`../messages/${l}.json`, import.meta.url), 'utf8'));

const cats: Category[] = [{ id: 'c1', module: 'catalog', name: 'Cabelo', position: 0 }];
const mk = (o: Partial<Item>): Item => ({ id: o.name ?? 'x', module: 'catalog', category_id: 'c1', name: 'x', description: '', price_minor: 100, promo_minor: null, stock: null, emoji: '🧴', image_path: null, active: true, position: 0, ...o });
const items: Item[] = [
  mk({ name: 'Shampoo', price_minor: 850000, stock: 12, description: 'Hidratante' }),
  mk({ name: 'Máscara', price_minor: 1200000, promo_minor: 990000, stock: 3, image_path: 't1/foto.jpg' }),
  mk({ name: 'Óleo', price_minor: 1500000, stock: 0, active: false }),
  mk({ name: 'Sem controlo', price_minor: 5000, stock: null }),
  mk({ name: 'Órfão', category_id: null, price_minor: 200 }),
];
const tenant = { id: 't1', currency: 'AOA', decimals: 2, country: 'AO', lowStock: 3 };
const html = (locale: string, mod: 'menu' | 'catalog', canEdit: boolean, its = items, cs = cats) =>
  renderToString(<NextIntlClientProvider locale={locale} messages={messages(locale)} timeZone="UTC"><ItemsManager tenant={tenant} module={mod} initialCategories={cs} initialItems={its} canEdit={canEdit} /></NextIntlClientProvider>)
    .replace(/<!-- -->/g, '');
const text = (h: string) => h.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');

// proprietário/admin, catálogo, pt-PT + negócio em Angola
let h = html('pt-PT', 'catalog', true), tx = text(h);
assert.match(tx, /Novo produto/); assert.match(tx, /Nova categoria/);
assert.match(tx, /Cabelo · 4/); assert.match(tx, /Sem categoria · 1/);
assert.match(tx, /8\s500,00\s?Kz/, 'preço em kwanzas com milhares agrupados');
assert.match(tx, /12\s000,00\s?Kz.*9\s900,00\s?Kz/, 'preço riscado + promoção');
assert.match(h, /<s>/);
assert.match(tx, /Baixo/); assert.match(tx, /Esgotado/); assert.match(tx, /Sem controlo de stock/);
assert.match(h, /<b>12<\/b>/, 'stock com botões + e −'); assert.match(h, /aria-label="\+"/);
assert.match(h, /src="https:\/\/x\.supabase\.co\/storage\/v1\/object\/public\/item-images\/t1\/foto\.jpg"/, 'foto do item');
assert.match(h, /🧴/, 'emoji quando não há foto');
assert.match(tx, /Editar/); assert.match(tx, /Eliminar/);
console.log('✔ ecrã de gestão (catálogo): preços, promoção, stock, fotos, categorias');

// só leitura (staff): sem botões de alterar
h = html('pt-PT', 'catalog', false); tx = text(h);
assert.match(tx, /Só o proprietário e os administradores/); assert.doesNotMatch(tx, /Eliminar/); assert.doesNotMatch(tx, /Novo produto/); assert.doesNotMatch(h, /aria-label="\+"/);
console.log('✔ staff vê a lista mas não vê ações de edição');

// cardápio: sem stock
h = html('pt-PT', 'menu', true, items.map((i) => ({ ...i, module: 'menu' as const })), cats.map((c) => ({ ...c, module: 'menu' as const }))); tx = text(h);
assert.match(tx, /Novo item/); assert.doesNotMatch(tx, /Esgotado/); assert.doesNotMatch(tx, /Sem controlo de stock/); assert.doesNotMatch(h, /aria-label="\+"/);
console.log('✔ cardápio não mostra stock');

// vazio e outros idiomas
tx = text(html('en', 'catalog', true, [], [])); assert.match(tx, /No products yet/); assert.match(tx, /New product/);
tx = text(html('es', 'menu', true, [], [])); assert.match(tx, /Todavía no tienes artículos/);
tx = text(html('pt-BR', 'catalog', true)); assert.match(tx, /Excluir/); assert.match(tx, /Sem controle de estoque/);
assert.match(text(html('en', 'catalog', true)), /AOA\s?8,500\.00/, 'inglês mantém o formato do visitante');
console.log('✔ estado vazio e idiomas en / es / pt-BR');
process.exit(0);
