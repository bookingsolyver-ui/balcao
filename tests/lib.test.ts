import assert from 'node:assert/strict';
import { toMinor, formatMoney, decimalsFor, pointsFor } from '../src/lib/money';
import { toE164Digits, waLink } from '../src/lib/phone';

assert.equal(decimalsFor('EUR'), 2);
assert.equal(decimalsFor('JPY'), 0);
assert.equal(decimalsFor('KWD'), 3);
assert.equal(toMinor('12,50', 'EUR'), 1250);
assert.equal(toMinor('12.5', 'USD'), 1250);
assert.equal(toMinor('1500', 'JPY'), 1500);
assert.equal(toMinor('0,1', 'EUR'), 10);
assert.equal(toMinor('19.995', 'EUR'), 2000);        // arredondamento
assert.equal(toMinor('abc', 'EUR'), null);
assert.equal(toMinor(0.1 + 0.2, 'EUR'), 30);          // sem erro de vírgula flutuante
assert.match(formatMoney(1250, 'EUR', 'pt-PT'), /12,50\s?€/);
assert.match(formatMoney(1250, 'BRL', 'pt-BR'), /R\$\s?12,50/);
assert.match(formatMoney(1500, 'JPY', 'ja-JP'), /1,500/);
assert.equal(pointsFor(1250, 'EUR', 2), 25);
assert.equal(pointsFor(1500, 'JPY', 1), 1500);

assert.equal(toE164Digits('912 345 678', 'PT'), '351912345678');
assert.equal(toE164Digits('+351 912 345 678', 'PT'), '351912345678');
assert.equal(toE164Digits('00351912345678', 'PT'), '351912345678');
assert.equal(toE164Digits('351912345678', 'PT'), '351912345678');
assert.equal(toE164Digits('(11) 99999-0000', 'BR'), '5511999990000');
assert.equal(toE164Digits('011 99999-0000', 'BR'), '5511999990000');
assert.equal(toE164Digits('+1 415 555 2671', 'PT'), '14155552671');
assert.equal(toE164Digits('12', 'PT'), null);
assert.equal(waLink('351912345678', 'Olá & obrigado'), 'https://wa.me/351912345678?text=Ol%C3%A1%20%26%20obrigado');
console.log('✔ utilidades de moeda e telefone OK');
