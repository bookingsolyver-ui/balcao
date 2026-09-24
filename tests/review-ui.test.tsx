// Formulário de avaliação: estrelas, vazio vs já existente, e a garantia visual de que é fácil de preencher.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderToString } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import { ReviewForm } from '../src/components/ReviewForm';
import type { ReviewRow } from '../src/lib/reviews';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://x.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'sb_publishable_teste';
const messages = (l: string) => JSON.parse(readFileSync(new URL(`../messages/${l}.json`, import.meta.url), 'utf8'));
const wrap = (l: string, node: React.ReactNode) => renderToString(<NextIntlClientProvider locale={l} messages={messages(l)} timeZone="UTC">{node}</NextIntlClientProvider>).replace(/<!-- -->/g, '');
const text = (h: string) => h.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');

let h = wrap('pt-PT', <ReviewForm tenantId="t1" tenantName="Mudanças Rápidas" existing={null} />); let tx = text(h);
assert.match(tx, /Avalie o Balcão/); assert.match(tx, /Publicar avaliação/); assert.doesNotMatch(tx, /Guardar alterações/, 'sem avaliação ainda: botão é "publicar", não "guardar"');
assert.match(h, /id="rv-name"[^>]*value="Mudanças Rápidas"/, 'sugere o nome do negócio por defeito');
assert.equal((h.match(/class="on"/g) ?? []).length, 5, 'sem avaliação prévia: começa nas 5 estrelas, todas acesas');
assert.match(h, /id="rv-body"[^>]*>\s*<\/textarea>|id="rv-body"[^>]*><\/textarea>/, 'comentário começa vazio');
console.log('✔ sem avaliação ainda: nome sugerido, 5 estrelas por defeito, botão "publicar"');

const existing: ReviewRow = { id: 'r1', rating: 4, body: 'Poupa-nos horas de WhatsApp todos os dias.', author_name: 'Ana, Perola&Charme', created_at: '2026-01-01T00:00:00Z' };
h = wrap('pt-PT', <ReviewForm tenantId="t1" tenantName="Perola&Charme" existing={existing} />); tx = text(h);
assert.match(tx, /Guardar alterações/); assert.doesNotMatch(tx, /Publicar avaliação/, 'já existe: botão passa a "guardar"');
assert.equal((h.match(/class="on"/g) ?? []).length, 4, 'mostra a nota já guardada (4 estrelas)');
assert.match(h, /Poupa-nos horas de WhatsApp todos os dias\./); assert.match(h, /value="Ana, Perola&amp;Charme"/);
console.log('✔ já existe avaliação: mostra o que já foi escrito, botão "guardar"');

h = wrap('en', <ReviewForm tenantId="t1" tenantName="Moving Co" existing={null} />); assert.match(text(h), /Review Balcão/); assert.match(text(h), /Publish review/);
h = wrap('es', <ReviewForm tenantId="t1" tenantName="Mudanzas" existing={existing} />); assert.match(text(h), /Guardar cambios/);
console.log('✔ em inglês e espanhol');
process.exit(0);
