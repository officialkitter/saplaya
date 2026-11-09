const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', 'crypto-polyfill.ts'), 'utf8');
const javascript = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;

function installCrypto({ platform = 'android', crypto, random = (bytes) => bytes.fill(42) } = {}) {
  const context = {
    ArrayBuffer, Uint8Array, Float32Array, Float64Array, DataView, TypeError, Error,
    crypto, exports: {},
    require(name) {
      if (name === 'expo-crypto') return { getRandomValues: random };
      if (name === 'react-native') return { Platform: { OS: platform } };
      return require(name);
    },
  };
  vm.runInNewContext(javascript, context);
  return context.crypto;
}

test('native fallback fills only the requested typed-array view', () => {
  const crypto = installCrypto();
  const bytes = new Uint8Array(8);
  const view = new Uint8Array(bytes.buffer, 2, 4);
  assert.equal(crypto.getRandomValues(view), view);
  assert.deepEqual([...bytes], [0, 0, 42, 42, 42, 42, 0, 0]);
});

test('native fallback rejects invalid types and oversized requests', () => {
  const crypto = installCrypto();
  assert.throws(() => crypto.getRandomValues(new Float32Array(2)), /integer typed array/);
  assert.throws(() => crypto.getRandomValues(new DataView(new ArrayBuffer(4))), /integer typed array/);
  assert.throws(() => crypto.getRandomValues(new Uint8Array(65537)), /65536/);
});

test('existing secure random implementation is preserved', () => {
  let called = false;
  const original = {
    getRandomValues(array) {
      assert.equal(this, original);
      called = true;
      return array;
    },
  };
  installCrypto({ crypto: original }).getRandomValues(new Uint8Array(4));
  assert.equal(called, true);
});

test('web without secure randomness fails rather than falling back', () => {
  let called = false;
  const crypto = installCrypto({ platform: 'web', random: () => { called = true; } });
  assert.throws(() => crypto.getRandomValues(new Uint8Array(4)), /unavailable/);
  assert.equal(called, false);
});

test('SHA-256 digest supports typed-array offsets', async () => {
  const crypto = installCrypto();
  const bytes = new Uint8Array([0, 97, 98, 99, 0]);
  const digest = await crypto.subtle.digest('SHA-256', bytes.subarray(1, 4));
  assert.equal(Buffer.from(digest).toString('hex'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});
