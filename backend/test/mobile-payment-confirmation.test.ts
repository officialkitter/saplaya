import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { confirmedOrder, verifyAfterPaymentBrowser } from '../../mobile/src/lib/payment-confirmation';

test('only a confirmed order is accepted after Pesapal checkout', () => {
  assert.deepEqual(confirmedOrder({ order_id: 'order-1' }), { order_id: 'order-1' });
  assert.throws(() => confirmedOrder({ status: 'pending', message: 'Processing' }), /still processing/);
  assert.throws(() => confirmedOrder({}), /did not contain a confirmed order/);
  assert.throws(() => confirmedOrder({ order_id: '' }), /did not contain a confirmed order/);
});

test('browser return verifies the initiated payment even if dismissed or callback data differs', async () => {
  for (const browserResult of [
    { type: 'dismiss' },
    { type: 'cancel' },
    { type: 'success', url: 'saplaya://payment-callback?tx_ref=other&order_tracking_id=other' },
  ]) {
    const calls: string[][] = [];
    const result = await verifyAfterPaymentBrowser(
      { txRef: 'original-ref', orderTrackingId: 'original-tracking' },
      async () => browserResult,
      async (txRef, trackingId) => { calls.push([txRef, trackingId]); return 'verified'; },
    );
    assert.equal(result, 'verified');
    assert.deepEqual(calls, [['original-ref', 'original-tracking']]);
  }
});

test('browser errors do not claim or verify a completed payment', async () => {
  let verified = false;
  await assert.rejects(verifyAfterPaymentBrowser(
    { txRef: 'original-ref', orderTrackingId: 'original-tracking' },
    async () => { throw new Error('Browser unavailable'); },
    async () => { verified = true; },
  ), /Browser unavailable/);
  assert.equal(verified, false);
});
