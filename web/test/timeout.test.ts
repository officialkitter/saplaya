import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RequestTimeoutError, withAbortTimeout, withTimeout } from '../src/lib/timeout';

test('admin startup timeout preserves success and errors', async () => {
  assert.equal(await withTimeout(Promise.resolve('ready'), 50), 'ready');
  await assert.rejects(withTimeout(Promise.reject(new Error('offline')), 50), /offline/);
});

test('admin startup timeout rejects a stalled operation', async () => {
  await assert.rejects(withTimeout(new Promise(() => {}), 10), /timed out/);
});

test('admin request timeout aborts a stalled request', async () => {
  let signal: AbortSignal | undefined;
  await assert.rejects(withAbortTimeout((requestSignal) => {
    signal = requestSignal;
    return new Promise(() => {});
  }, undefined, 10), RequestTimeoutError);
  assert.equal(signal?.aborted, true);
});

test('admin request preserves success, failures, and caller cancellation', async () => {
  assert.equal(await withAbortTimeout(async () => 'ready', undefined, 50), 'ready');
  await assert.rejects(withAbortTimeout(async () => { throw new Error('offline'); }, undefined, 50), /offline/);
  const controller = new AbortController();
  const pending = withAbortTimeout((signal) => new Promise((_, reject) => {
    signal.addEventListener('abort', () => reject(new Error('cancelled')));
  }), controller.signal, 50);
  controller.abort();
  await assert.rejects(pending, /cancelled/);
});
