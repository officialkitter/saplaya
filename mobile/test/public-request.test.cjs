const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', 'public-request.ts'), 'utf8');
const javascript = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const context = { exports: {}, AbortController, setTimeout, clearTimeout, fetch };
vm.runInNewContext(javascript, context);
const { fetchPublicJson } = context.exports;

test('public reads return JSON and reject HTTP failures', async () => {
  context.fetch = async () => new Response(JSON.stringify({ value: 1 }), { status: 200 });
  assert.equal((await fetchPublicJson('https://example.test')).value, 1);
  context.fetch = async () => new Response(null, { status: 503 });
  await assert.rejects(fetchPublicJson('https://example.test'), /request failed/);
});

test('a stalled public read times out and aborts its request', async () => {
  let signal;
  context.fetch = async (_url, init) => {
    signal = init.signal;
    return new Promise(() => {});
  };
  await assert.rejects(fetchPublicJson('https://example.test', 10), /timed out/);
  assert.equal(signal.aborted, true);
});
