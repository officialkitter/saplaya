import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { confirmedOrder } from '../../mobile/src/lib/payment-confirmation';

test('only a confirmed order is accepted after Pesapal checkout', () => {
  assert.deepEqual(confirmedOrder({ order_id: 'order-1' }), { order_id: 'order-1' });
  assert.throws(() => confirmedOrder({ status: 'pending', message: 'Processing' }), /still processing/);
  assert.throws(() => confirmedOrder({}), /did not contain a confirmed order/);
  assert.throws(() => confirmedOrder({ order_id: '' }), /did not contain a confirmed order/);
});
