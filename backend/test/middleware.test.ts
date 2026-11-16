import { strict as assert } from 'node:assert';
import { before, test } from 'node:test';

let errorHandler: (error: unknown) => { status: number; body: { error: string } };
let publicErrorMessage: (error: unknown) => string;

before(async () => {
  process.env.SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_SECRET_KEY = 'test-secret-key';
  const middleware = await import('../src/middleware.js');
  errorHandler = middleware.errorHandler;
  publicErrorMessage = middleware.publicErrorMessage;
});

test('unexpected API errors do not disclose database or provider details', () => {
  const originalError = console.error;
  const logged: unknown[] = [];
  console.error = (...values: unknown[]) => logged.push(values);
  try {
    const raw = 'relation private.customer_data does not exist';
    const response = errorHandler(new Error(raw));
    assert.deepEqual(response, {
      status: 500,
      body: { error: 'We could not complete this request. Please try again.' },
    });
    assert.equal(JSON.stringify(response).includes(raw), false);
    assert.equal(JSON.stringify(logged).includes(raw), false);
    assert.deepEqual(publicErrorMessage(new Error(raw)), 'We could not complete this request. Please try again.');
    assert.equal(JSON.stringify(logged).includes(raw), false);
  } finally {
    console.error = originalError;
  }
});
