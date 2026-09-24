// Mudar o e-mail de login: só valida a forma; a confirmação a sério é sempre pelo link que vai para o e-mail novo.
import assert from 'node:assert/strict';
import { buildEmailChange } from '../src/lib/account';

assert.deepEqual(buildEmailChange('pessoal@gmail.com', 'empresa@negocio.pt'), { ok: true, email: 'empresa@negocio.pt' });
assert.deepEqual(buildEmailChange('pessoal@gmail.com', '  empresa@negocio.pt  '), { ok: true, email: 'empresa@negocio.pt' }, 'tira espaços à volta');
assert.deepEqual(buildEmailChange('pessoal@gmail.com', 'não é um email'), { ok: false, error: 'invalid' });
assert.deepEqual(buildEmailChange('pessoal@gmail.com', ''), { ok: false, error: 'invalid' });
assert.deepEqual(buildEmailChange('pessoal@gmail.com', 'pessoal@gmail.com'), { ok: false, error: 'same' }, 'igual ao atual: não há nada para mudar');
assert.deepEqual(buildEmailChange('Pessoal@Gmail.com', 'pessoal@gmail.com'), { ok: false, error: 'same' }, 'maiúsculas/minúsculas não contam como diferente');
console.log('✔ validação da forma do pedido de mudança de e-mail');
process.exit(0);
