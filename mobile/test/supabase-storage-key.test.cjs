const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

function loadClient(file, env) {
  const source = fs.readFileSync(file, 'utf8');
  const javascript = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const clients = [];
  const exports = {};
  const context = {
    exports,
    process: { env },
    require(name) {
      if (name === '@supabase/supabase-js') {
        return { createClient: (_url, _key, options) => {
          clients.push(options);
          return {};
        } };
      }
      if (name === './auth-storage') return { authStorage: {} };
      if (name === './crypto-polyfill' || name === 'react-native-url-polyfill/auto') return {};
      throw new Error(`Unexpected dependency: ${name}`);
    },
  };
  vm.runInNewContext(javascript, context);
  return { clients, exports };
}

const mobileFile = path.join(__dirname, '..', 'src', 'lib', 'supabase.ts');
const webFile = path.join(__dirname, '..', '..', 'web', 'src', 'lib', 'supabase.ts');
const legacyKey = 'sb-example-auth-token';

test('mobile applies the same configured storage key to both auth clients', () => {
  const { clients } = loadClient(mobileFile, {
    EXPO_PUBLIC_SUPABASE_URL: 'https://auth.example.com',
    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'test-key',
    EXPO_PUBLIC_API_URL: 'https://api.example.com',
    EXPO_PUBLIC_SUPABASE_AUTH_STORAGE_KEY: legacyKey,
  });
  assert.equal(clients.length, 2);
  assert.equal(clients[0].auth.storageKey, legacyKey);
  assert.equal(clients[1].auth.storageKey, legacyKey);
});

test('unset mobile storage key preserves the Supabase default', () => {
  const { clients } = loadClient(mobileFile, {
    EXPO_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'test-key',
    EXPO_PUBLIC_API_URL: 'https://api.example.com',
  });
  assert.equal('storageKey' in clients[0].auth, false);
  assert.equal('storageKey' in clients[1].auth, false);
});

test('admin client applies an optional storage key without altering the default', () => {
  for (const key of [legacyKey, undefined]) {
    const { clients, exports } = loadClient(webFile, {
      NEXT_PUBLIC_SUPABASE_URL: 'https://auth.example.com',
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'test-key',
      NEXT_PUBLIC_SUPABASE_AUTH_STORAGE_KEY: key,
    });
    exports.getSupabase();
    assert.equal(clients.length, 1);
    if (key) assert.equal(clients[0].auth.storageKey, key);
    else assert.equal('storageKey' in clients[0].auth, false);
  }
});
