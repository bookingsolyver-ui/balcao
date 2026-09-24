// Validação de IBAN com dígito de controlo real (não só o formato) — Angola, Portugal e outros.
// Os IBANs abaixo são fictícios mas com o dígito de controlo calculado corretamente (algoritmo MOD-97 independente).
import assert from 'node:assert/strict';
import { formatIban, isValidIban, normalizeIban } from '../src/lib/iban';

assert.equal(isValidIban('AO23004000000123456789012'), true, 'Angola: válido');
assert.equal(isValidIban('PT14000201231234567890123'), true, 'Portugal: válido');
assert.equal(isValidIban('DE89370400440532013000'), true, 'Alemanha: válido');
assert.equal(isValidIban('GB73WEST12345698765400'), true, 'Reino Unido: válido');
assert.equal(isValidIban('FR7920041010050500013M02600'), true, 'França: válido');
assert.equal(isValidIban('MZ46000100000011834194100'), true, 'Moçambique: válido');
assert.equal(isValidIban('CV28000500000020108154100'), true, 'Cabo Verde: válido');
console.log('✔ IBANs de vários países (dígito de controlo calculado de forma independente): aceites');

// aceita com espaços/minúsculas (normaliza antes de validar)
assert.equal(isValidIban('ao23 0040 0000 0123 4567 8901 2'), true, 'espaços e minúsculas não importam');
assert.equal(isValidIban('  PT14 0002 0123 1234 5678 9012 3  '), true);

// dígito de controlo errado (mudei o último algarismo do BBAN) — tem de recusar
assert.equal(isValidIban('AO23004000000123456789013'), false, 'dígito de controlo não bate certo: recusa');
assert.equal(isValidIban('PT14000201231234567890124'), false);
// comprimento errado para o país
assert.equal(isValidIban('AO2300400000012345678901'), false, 'Angola com 1 dígito a menos');
assert.equal(isValidIban('PT140002012312345678901230'), false, 'Portugal com dígitos a mais');
// país não registado no IBAN
assert.equal(isValidIban('BR1500000000000010932840814'), false, 'Brasil não está no registo IBAN');
assert.equal(isValidIban('XX82WEST12345698765432'), false, 'código de país inexistente');
// lixo
assert.equal(isValidIban(''), false); assert.equal(isValidIban('abc'), false); assert.equal(isValidIban('923306869'), false, 'um número de telefone não é um IBAN');
console.log('✔ recusa dígito de controlo errado, comprimento errado, país sem IBAN e lixo');

assert.equal(normalizeIban('ao23 0040-0000/0123.4567 8901 2'), 'AO23004000000123456789012', 'normaliza: maiúsculas, sem separadores');
assert.equal(formatIban('AO23004000000123456789012'), 'AO23 0040 0000 0123 4567 8901 2', 'agrupado de 4 em 4 para leitura');
console.log('✔ normalização e formatação para leitura');
process.exit(0);
