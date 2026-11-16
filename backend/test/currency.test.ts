import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  amountInMinorUnits,
  isE164Phone,
  paymentAmountsMatch,
  quoteCurrencyAmount,
  supportedPaymentCurrencies,
} from '../src/currency.js';

test('checkout quotes use merchant-enabled rates and ISO currency precision', () => {
  const enabled = supportedPaymentCurrencies('TZS,USD,JPY,KWD');
  assert.deepEqual(enabled, ['TZS', 'USD', 'JPY', 'KWD']);
  assert.deepEqual(quoteCurrencyAmount(12_345, 'USD', { USD: 0.0004 }, enabled), {
    currency: 'USD',
    payment_amount: 4.94,
    exchange_rate: 0.0004,
    fraction_digits: 2,
  });
  assert.equal(quoteCurrencyAmount(101, 'JPY', { JPY: 0.15 }, enabled)?.payment_amount, 15);
  assert.equal(quoteCurrencyAmount(1000, 'KWD', { KWD: 0.0001245 }, enabled)?.payment_amount, 0.125);
});

test('unsupported currencies and missing FX rates never fall back to TZS', () => {
  const enabled = supportedPaymentCurrencies('TZS,USD');
  assert.equal(quoteCurrencyAmount(1000, 'EUR', { EUR: 0.0003 }, enabled), null);
  assert.throws(() => quoteCurrencyAmount(1000, 'USD', {}, enabled), /exchange rate.*unavailable/i);
  assert.throws(() => supportedPaymentCurrencies('TZS,NOT'), /ISO 4217/);
});

test('cash quote conversion remains available in TZS when the merchant only enables other currencies', () => {
  const enabled = supportedPaymentCurrencies('USD');
  assert.deepEqual(quoteCurrencyAmount(2500, 'TZS', {}, enabled), {
    currency: 'TZS',
    payment_amount: 2500,
    exchange_rate: 1,
    fraction_digits: 2,
  });
  assert.equal(quoteCurrencyAmount(2500, 'USD', { USD: 0.0004 }, enabled)?.payment_amount, 1);
});

test('gateway amounts are compared at the currency minor-unit precision', () => {
  assert.equal(paymentAmountsMatch('12.34', 12.34, 'USD'), true);
  assert.equal(paymentAmountsMatch('12.35', 12.34, 'USD'), false);
  assert.equal(paymentAmountsMatch('12.3401', 12.34, 'USD'), false);
  assert.equal(paymentAmountsMatch('123', 123, 'JPY'), true);
  assert.equal(paymentAmountsMatch('123.1', 123, 'JPY'), false);
  assert.equal(amountInMinorUnits('0.125', 'KWD'), 125);
  assert.equal(amountInMinorUnits('0.1251', 'KWD'), null);
});

test('online checkout phone validation accepts international E.164 and rejects local forms', () => {
  assert.equal(isE164Phone('+255700000000'), true);
  assert.equal(isE164Phone('+12025550123'), true);
  assert.equal(isE164Phone('0700000000'), false);
  assert.equal(isE164Phone('+0123456789'), false);
  assert.equal(isE164Phone('+123'), false);
});
