// Ecrã "A minha conta": e-mail atual, formulário de mudança, e a mensagem de confirmação (nunca muda sem clicar no link).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderToString } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import { AccountForm } from '../src/components/AccountForm';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://x.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'sb_publishable_teste';
const messages = (l: string) => JSON.parse(readFileSync(new URL(`../messages/${l}.json`, import.meta.url), 'utf8'));
const wrap = (l: string, node: React.ReactNode) => renderToString(<NextIntlClientProvider locale={l} messages={messages(l)} timeZone="UTC">{node}</NextIntlClientProvider>).replace(/<!-- -->/g, '');
const text = (h: string) => h.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');

let h = wrap('pt-PT', <AccountForm currentEmail="pessoal@gmail.com" />); let tx = text(h);
assert.match(tx, /E-mail de acesso/); assert.match(tx, /E-mail atual\s*pessoal@gmail\.com/); assert.match(tx, /Novo e-mail/);
assert.match(tx, /Por segurança, o e-mail só muda depois de confirmar através de um link/); assert.match(tx, /Mudar e-mail/);
assert.match(h, /id="acc-email"[^>]*type="email"/);
console.log('✔ ecrã: e-mail atual, formulário, e o aviso de que a confirmação é sempre obrigatória');

h = wrap('pt-PT', <AccountForm currentEmail="pessoal@gmail.com" initialMsg={{ ok: true, text: 'Enviámos um link de confirmação para empresa@negocio.pt. O e-mail de acesso só muda depois de clicar nesse link.' }} />); tx = text(h);
assert.match(tx, /Enviámos um link de confirmação para empresa@negocio\.pt/); assert.match(tx, /só muda depois de clicar nesse link/);
assert.match(h, /class="ok-box"/, 'mensagem de sucesso, não de erro');
console.log('✔ mensagem de confirmação enviada: deixa claro que nada muda antes de se clicar no link');

h = wrap('pt-PT', <AccountForm currentEmail="pessoal@gmail.com" initialMsg={{ ok: false, text: 'Esse já é o e-mail atual.' }} />);
assert.match(h, /class="err"/); assert.match(text(h), /Esse já é o e-mail atual\./);
console.log('✔ mensagem de erro (ex.: e-mail igual ao atual)');

h = wrap('en', <AccountForm currentEmail="personal@gmail.com" />); assert.match(text(h), /Login email/); assert.match(text(h), /your email only changes after you confirm/);
h = wrap('es', <AccountForm currentEmail="personal@gmail.com" />); assert.match(text(h), /Correo de acceso/); assert.match(text(h), /solo cambia después de confirmarlo/);
console.log('✔ em inglês e espanhol, mantém a mesma garantia de confirmação obrigatória');
process.exit(0);
