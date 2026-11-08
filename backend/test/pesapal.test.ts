import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  isPaymentCompleted,
  isPaymentFailed,
} from '../src/pesapal.js';

test('PesaPal API status_code 1 is verified as completed', () => {
  assert.equal(isPaymentCompleted({ status_code: 1 }), true);
  assert.equal(isPaymentCompleted({ status_code: '1' }), true);
  assert.equal(isPaymentCompleted({ payment_status_code: 1 }), true);
});

test('explicit payment descriptions take precedence over numeric response codes', () => {
  assert.equal(isPaymentCompleted({ payment_status_description: 'Completed', status_code: 0 }), true);
  assert.equal(isPaymentCompleted({ payment_status_description: 'Failed', status_code: 1 }), false);
  assert.equal(isPaymentFailed({ payment_status_description: 'Reversed', status_code: 1 }), true);
});

test('HTTP status is not mistaken for a successful payment status', () => {
  assert.equal(isPaymentCompleted({ status: 200 }), false);
  assert.equal(isPaymentFailed({ status: 200 }), false);
});

test('failed, cancelled, and reversed statuses are non-completed', () => {
  for (const status_code of [2, 3]) {
    assert.equal(isPaymentCompleted({ status_code }), false);
    assert.equal(isPaymentFailed({ status_code }), true);
  }
  assert.equal(isPaymentFailed({ status: 'CANCELLED' }), true);
  assert.equal(isPaymentFailed({ payment_status_description: 'Failed' }), true);
});
