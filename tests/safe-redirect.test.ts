// safeInternalPath: nunca deixa sair do site — é a única porta de entrada para o "returnTo" do login/registo.
import assert from 'node:assert/strict';
import { safeInternalPath } from '../src/lib/safe-redirect';

assert.equal(safeInternalPath('/pt-PT/convite/ABCD1234', '/x'), '/pt-PT/convite/ABCD1234', 'caminho interno normal: passa');
assert.equal(safeInternalPath(null, '/x'), '/x', 'nada indicado: usa o valor de recurso');
assert.equal(safeInternalPath('', '/x'), '/x', 'vazio: usa o valor de recurso');
assert.equal(safeInternalPath('//evil.com', '/x'), '/x', '"//" é um redirecionamento para outro site — recusado, mesmo começando por barra');
assert.equal(safeInternalPath('https://evil.com', '/x'), '/x', 'endereço completo para fora: recusado');
assert.equal(safeInternalPath('evil.com/pt-PT', '/x'), '/x', 'sem barra a abrir: recusado');
assert.equal(safeInternalPath('/x\\evil.com', '/x'), '/x', 'barra invertida (truque de alguns navegadores): recusado');
assert.equal(safeInternalPath('  /pt-PT/app  ', '/x'), '/pt-PT/app', 'espaços à volta são ignorados');
console.log('✔ safeInternalPath: só deixa passar caminhos internos, nunca um redirecionamento para fora');
process.exit(0);
