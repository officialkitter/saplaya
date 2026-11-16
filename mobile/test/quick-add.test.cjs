const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', 'volume.ts'), 'utf8');
const javascript = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const context = { exports: {} };
vm.runInNewContext(javascript, context);
const { quickAddQuantity } = context.exports;

test('quick add respects wholesale minimum and existing basket quantity', () => {
  const product = { stock: 20, wholesale_min_qty: 10 };
  assert.equal(quickAddQuantity(product, 0, 'retail'), 1);
  assert.equal(quickAddQuantity(product, 0, 'wholesale'), 10);
  assert.equal(quickAddQuantity(product, 4, 'wholesale'), 6);
  assert.equal(quickAddQuantity(product, 10, 'wholesale'), 1);
});

test('quick add does not exceed stock or the basket limit', () => {
  assert.equal(quickAddQuantity({ stock: 9, wholesale_min_qty: 10 }, 0, 'wholesale'), 0);
  assert.equal(quickAddQuantity({ stock: 4, wholesale_min_qty: 10 }, 4, 'retail'), 0);
  assert.equal(quickAddQuantity({ stock: 20000, wholesale_min_qty: 10 }, 10000, 'retail'), 0);
});
