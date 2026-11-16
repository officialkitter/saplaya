import assert from 'node:assert/strict';
import { test } from 'node:test';
import { withTimeout } from '../src/lib/timeout';

test('admin startup timeout preserves success and errors', async () => {
  assert.equal(await withTimeout(Promise.resolve('ready'), 50), 'ready');
  await assert.rejects(withTimeout(Promise.reject(new Error('offline')), 50), /offline/);
});

test('admin startup timeout rejects a stalled operation', async () => {
  await assert.rejects(withTimeout(new Promise(() => {}), 10), /timed out/);
});
