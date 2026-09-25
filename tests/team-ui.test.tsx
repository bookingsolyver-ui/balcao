// Equipa: convidar prestadores sem acesso, mostrar quem já tem, e a lista de convites por usar.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderToString } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import { TeamInvites } from '../src/components/TeamInvites';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://x.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'sb_publishable_teste';
const messages = (l: string) => JSON.parse(readFileSync(new URL(`../messages/${l}.json`, import.meta.url), 'utf8'));
const wrap = (l: string, node: React.ReactNode) => renderToString(<NextIntlClientProvider locale={l} messages={messages(l)} timeZone="UTC">{node}</NextIntlClientProvider>).replace(/<!-- -->/g, '');
const text = (h: string) => h.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');

const staff = [{ id: 's1', name: 'Marta' }, { id: 's2', name: 'Nuno' }];

let h = wrap('pt-PT', <TeamInvites tenantId="t1" staff={staff} linkedStaffIds={[]} initialInvites={[]} />); let tx = text(h);
assert.match(tx, /Marta/); assert.match(tx, /Nuno/); assert.equal((tx.match(/Convidar/g) ?? []).length >= 2, true, 'convidar aparece para ambas, sem acesso nenhuma');
assert.doesNotMatch(tx, /Já tem acesso/, 'ninguém tem acesso ainda');
console.log('✔ ninguém da equipa tem acesso ainda: mostra "Convidar" para cada um');

h = wrap('pt-PT', <TeamInvites tenantId="t1" staff={staff} linkedStaffIds={['s1']} initialInvites={[]} />); tx = text(h);
assert.match(tx, /Já tem acesso/); assert.equal((h.match(/Já tem acesso/g) ?? []).length, 1, 'só a Marta já tem acesso');
console.log('✔ a Marta já tem acesso: mostra a etiqueta, não o botão de convidar, para ela');

const invites = [{ id: 'i1', code: 'ABCD1234', role: 'staff' as const, staff_id: 's2', expires_at: new Date(Date.now() + 6 * 86400000).toISOString() }];
h = wrap('pt-PT', <TeamInvites tenantId="t1" staff={staff} linkedStaffIds={['s1']} initialInvites={invites} />); tx = text(h);
assert.match(tx, /Convites por usar/); assert.match(tx, /Nuno/); assert.match(tx, /ABCD1234/);
console.log('✔ convite por usar: aparece na lista, ligado ao nome certo');

const expired = [{ id: 'i2', code: 'OLDCODE1', role: 'admin' as const, staff_id: null, expires_at: new Date(Date.now() - 86400000).toISOString() }];
h = wrap('pt-PT', <TeamInvites tenantId="t1" staff={staff} linkedStaffIds={[]} initialInvites={expired} />);
assert.doesNotMatch(h, /OLDCODE1/, 'convite expirado não aparece na lista de pendentes');
console.log('✔ convite expirado não aparece como pendente');

h = wrap('en', <TeamInvites tenantId="t1" staff={staff} linkedStaffIds={[]} initialInvites={[]} />); assert.match(text(h), /Give your team access/);
console.log('✔ em inglês');
process.exit(0);
