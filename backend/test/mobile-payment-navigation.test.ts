import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { classifyPaymentNavigation } from '../../mobile/src/lib/payment-navigation';

const api = 'https://api.example.test';

test('only exact configured HTTPS and app callbacks finish checkout', () => {
  assert.equal(classifyPaymentNavigation(`${api}/payments/callback?tx_ref=test`, api), 'callback');
  assert.equal(classifyPaymentNavigation('saplaya://payment-callback?tx_ref=test', api), 'callback');
  assert.equal(classifyPaymentNavigation('https://api.example.test.evil.test/payments/callback', api), 'checkout');
  assert.equal(classifyPaymentNavigation('https://api.example.test/payments/callback/other', api), 'checkout');
  assert.equal(classifyPaymentNavigation('saplaya://payment-callback.evil.test', api), 'blocked');
});

test('only secure web pages are allowed inside checkout', () => {
  assert.equal(classifyPaymentNavigation('https://pay.pesapal.com/v3/page', api), 'checkout');
  assert.equal(classifyPaymentNavigation('https://bank.example/3ds', api), 'checkout');
  assert.equal(classifyPaymentNavigation('http://pay.pesapal.com/page', api), 'blocked');
  assert.equal(classifyPaymentNavigation('file:///etc/passwd', api), 'blocked');
  assert.equal(classifyPaymentNavigation('https://user@pay.pesapal.com/', api), 'blocked');
  assert.equal(classifyPaymentNavigation('not a url', api), 'blocked');
});
