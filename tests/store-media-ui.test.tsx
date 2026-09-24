// Logo e capa nas Definições: vazio (placeholder) vs já enviado (mostra a imagem), e só edita quem pode.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderToString } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import { StoreMediaForm } from '../src/components/StoreMediaForm';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://x.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'sb_publishable_teste';
const messages = (l: string) => JSON.parse(readFileSync(new URL(`../messages/${l}.json`, import.meta.url), 'utf8'));
const wrap = (l: string, node: React.ReactNode) => renderToString(<NextIntlClientProvider locale={l} messages={messages(l)} timeZone="UTC">{node}</NextIntlClientProvider>).replace(/<!-- -->/g, '');
const text = (h: string) => h.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');

let h = wrap('pt-PT', <StoreMediaForm tenantId="t1" logoPath={null} coverPath={null} canEdit />); let tx = text(h);
assert.match(tx, /Logo e foto de capa/); assert.match(tx, /Adicionar logo/); assert.match(tx, /Adicionar foto de capa/);
assert.doesNotMatch(h, /<img/, 'sem nada enviado ainda: nenhuma tag de imagem');
assert.match(h, /type="file"/, 'consegue escolher ficheiro (pode editar)');
console.log('✔ sem logo nem capa: mostra os textos de convite, sem imagem nenhuma');

h = wrap('pt-PT', <StoreMediaForm tenantId="t1" logoPath="t1/store/logo-1.jpg" coverPath="t1/store/cover-1.jpg" canEdit />); tx = text(h);
assert.equal((h.match(/<img/g) ?? []).length, 2, 'com os dois enviados: duas imagens reais'); assert.match(tx, /Remover/);
assert.match(h, /src="https:\/\/x\.supabase\.co\/storage\/v1\/object\/public\/item-images\/t1\/store\/logo-1\.jpg"/);
console.log('✔ com logo e capa já enviados: mostra as imagens reais e o botão de remover');

h = wrap('pt-PT', <StoreMediaForm tenantId="t1" logoPath="t1/store/logo-1.jpg" coverPath={null} canEdit={false} />); tx = text(h);
assert.doesNotMatch(h, /type="file"/, 'sem poder editar: sem campo de escolher ficheiro'); assert.doesNotMatch(tx, /Remover/, 'nem botão de remover'); assert.equal((h.match(/<img/g) ?? []).length, 1, 'mas continua a ver a logo já lá posta');
console.log('✔ quem não pode editar: vê as imagens, mas não consegue mexer');

h = wrap('en', <StoreMediaForm tenantId="t1" logoPath={null} coverPath={null} canEdit />); assert.match(text(h), /Logo and cover photo/);
console.log('✔ em inglês');
process.exit(0);
