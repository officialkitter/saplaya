import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  getRegisteredIpns,
  isPaymentCompleted,
  isPaymentFailed,
  ipnAcknowledgement,
  submitOrder,
} from '../src/pesapal.js';

test('IPN acknowledgement includes the provider-required fields and status', () => {
  for (const status of [200, 500] as const) {
    assert.deepEqual(ipnAcknowledgement('IPNCHANGE', 'tracking-id', 'merchant-reference', status), {
      orderNotificationType: 'IPNCHANGE',
      orderTrackingId: 'tracking-id',
      orderMerchantReference: 'merchant-reference',
      status,
    });
  }
});

test('registered IPN lookup returns only valid endpoint IDs and URLs', async () => {
  const savedFetch = globalThis.fetch;
  const savedKey = process.env.PESAPAL_CONSUMER_KEY;
  const savedSecret = process.env.PESAPAL_CONSUMER_SECRET;
  const urls: string[] = [];
  process.env.PESAPAL_CONSUMER_KEY = 'test-key';
  process.env.PESAPAL_CONSUMER_SECRET = 'test-secret';
  globalThis.fetch = async (input) => {
    const url = String(input);
    urls.push(url);
    if (url.endsWith('/api/Auth/RequestToken')) {
      return Response.json({ token: 'test-token', expires_in: 3600 });
    }
    return Response.json([{ ipn_id: 'ipn-1', url: 'https://api.example.test/ipn' }]);
  };
  try {
    assert.deepEqual(await getRegisteredIpns(), [
      { ipn_id: 'ipn-1', url: 'https://api.example.test/ipn' },
    ]);
    assert.ok(urls.some((url) => url.endsWith('/api/URLSetup/GetIpnList')));
  } finally {
    globalThis.fetch = savedFetch;
    if (savedKey === undefined) delete process.env.PESAPAL_CONSUMER_KEY;
    else process.env.PESAPAL_CONSUMER_KEY = savedKey;
    if (savedSecret === undefined) delete process.env.PESAPAL_CONSUMER_SECRET;
    else process.env.PESAPAL_CONSUMER_SECRET = savedSecret;
  }
});

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
  for (const status_code of [0, 2, 3]) {
    assert.equal(isPaymentCompleted({ status_code }), false);
    assert.equal(isPaymentFailed({ status_code }), true);
  }
  assert.equal(isPaymentFailed({ status: 'CANCELLED' }), true);
  assert.equal(isPaymentFailed({ payment_status_description: 'Invalid' }), true);
  assert.equal(isPaymentFailed({ payment_status_description: 'Failed' }), true);
  assert.equal(isPaymentFailed({ payment_status_code: 4 }), true);
});

test('in-progress Pesapal statuses remain pending instead of being marked failed', () => {
  assert.equal(isPaymentFailed({ payment_status_description: 'Processing', status_code: 3 }), false);
  assert.equal(isPaymentFailed({ payment_status_description: 'Pending', status_code: 2 }), false);
  assert.equal(isPaymentFailed({ payment_status_code: 3 }), false);
});

test('Pesapal submits selected ISO currency and decimal amount without whole-unit rounding', async () => {
  const savedFetch = globalThis.fetch;
  const savedKey = process.env.PESAPAL_CONSUMER_KEY;
  const savedSecret = process.env.PESAPAL_CONSUMER_SECRET;
  const submitted: Record<string, unknown>[] = [];
  process.env.PESAPAL_CONSUMER_KEY = 'test-key';
  process.env.PESAPAL_CONSUMER_SECRET = 'test-secret';
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.endsWith('/api/Auth/RequestToken')) {
      return Response.json({ token: 'test-token', expires_in: 3600 });
    }
    submitted.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    return Response.json({
      order_tracking_id: 'tracking-1',
      merchant_reference: 'saplaya-test',
      redirect_url: 'https://cybqa.pesapal.com/pesapalv3/checkout',
    });
  };
  try {
    await submitOrder({
      reference: 'saplaya-test',
      amount: 12.34,
      currency: 'USD',
      callbackUrl: 'https://api.example.test/callback',
      ipnId: 'ipn-1',
      email: 'buyer@example.test',
      phone: '+12025550123',
      name: 'Buyer Example',
    });
    assert.equal(submitted[0].currency, 'USD');
    assert.equal(submitted[0].amount, 12.34);
    assert.equal(submitted[0].redirect_mode, 'TOP_WINDOW');
    await assert.rejects(submitOrder({
      reference: 'saplaya-test',
      amount: 12.345,
      currency: 'USD',
      callbackUrl: 'https://api.example.test/callback',
      ipnId: 'ipn-1',
      email: 'buyer@example.test',
      phone: '+12025550123',
      name: 'Buyer Example',
    }), /invalid precision/);
  } finally {
    globalThis.fetch = savedFetch;
    if (savedKey === undefined) delete process.env.PESAPAL_CONSUMER_KEY;
    else process.env.PESAPAL_CONSUMER_KEY = savedKey;
    if (savedSecret === undefined) delete process.env.PESAPAL_CONSUMER_SECRET;
    else process.env.PESAPAL_CONSUMER_SECRET = savedSecret;
  }
});
