import { createHmac } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { loadPaymentGatewayConfig, PaymentConfigurationError } from '../src/payments/config.js';
import { PaymentGateway, settlePayment, type SettlementStore, type StoredPayment } from '../src/payments/gateway.js';
import {
  SnippeProvider,
  PayPalProvider,
  StripeProvider,
  stripePaymentPageUrl,
  toStripeMinorUnits,
  verifySnippeWebhook,
  verifyStripeWebhook,
  WebhookVerificationError,
  type PaymentProvider,
  type VerifiedPayment,
} from '../src/payments/providers.js';

const liveStripeEnv = {
  PAYMENT_PROVIDERS: 'stripe',
  PAYMENT_ENVIRONMENT: 'live',
  PUBLIC_API_URL: 'https://api.example.com',
  STRIPE_SECRET_KEY: 'sk_live_abcdefghijklmnop1234',
  STRIPE_PUBLISHABLE_KEY: 'pk_live_abcdefghijklmnop1234',
  STRIPE_PAYMENT_PAGE_URL: 'https://shop.example.com/checkout/pay',
  STRIPE_WEBHOOK_SECRET: 'whsec_abcdefghijklmnop1234',
  STRIPE_CURRENCIES: 'USD,EUR',
};

const livePayPalEnv = {
  PAYMENT_PROVIDERS: 'paypal',
  PAYMENT_ENVIRONMENT: 'live',
  PUBLIC_API_URL: 'https://api.example.com',
  PAYPAL_CLIENT_ID: 'client-id-1234',
  PAYPAL_CLIENT_SECRET: 'paypal-secret-value',
  PAYPAL_WEBHOOK_ID: 'webhook-id-1234',
  PAYPAL_CURRENCIES: 'USD,EUR',
};

function configProblems(env: Record<string, string>): string[] {
  try {
    loadPaymentGatewayConfig(env);
  } catch (error) {
    assert.ok(error instanceof PaymentConfigurationError);
    return error.problems;
  }
  return [];
}

test('explicit payment config fails closed on unsafe or incomplete settings', () => {
  assert.deepEqual(configProblems(liveStripeEnv), []);
  assert.match(configProblems({ ...liveStripeEnv, STRIPE_SECRET_KEY: 'sk_test_abcdefghijklmnop1234' }).join(), /test key/);
  assert.match(configProblems({ ...liveStripeEnv, STRIPE_WEBHOOK_SECRET: '' }).join(), /STRIPE_WEBHOOK_SECRET is required/);
  assert.match(configProblems({ ...liveStripeEnv, STRIPE_PUBLISHABLE_KEY: 'pk_test_abcdefghijklmnop1234' }).join(), /STRIPE_PUBLISHABLE_KEY is a test key/);
  assert.match(configProblems({ ...liveStripeEnv, STRIPE_PAYMENT_PAGE_URL: 'http://shop.example.com/checkout/pay' }).join(), /PAGE_URL must use https/);
  assert.match(configProblems({ ...liveStripeEnv, STRIPE_PAYMENT_PAGE_URL: '' }).join(), /STRIPE_PAYMENT_PAGE_URL is required/);
  assert.match(configProblems({ ...liveStripeEnv, STRIPE_CURRENCIES: 'USD,HUF' }).join(), /HUF uses Stripe special-case/);
  assert.match(configProblems({ ...liveStripeEnv, PUBLIC_API_URL: 'http://api.example.com' }).join(), /https/);
  assert.match(configProblems({ ...liveStripeEnv, PAYMENT_PROVIDERS: 'stripe,stripe' }).join(), /more than once/);
  assert.match(configProblems({ ...liveStripeEnv, PAYMENT_PROVIDERS: 'stripe,unknown' }).join(), /unknown provider "unknown"/);
  assert.match(configProblems({ ...liveStripeEnv, PAYMENT_SUPPORTED_CURRENCIES: 'USD' }).join(), /remove it/);
  assert.match(configProblems({
    ...liveStripeEnv,
    PAYMENT_ENVIRONMENT: 'test',
    STRIPE_SECRET_KEY: 'sk_test_abcdefghijklmnop1234',
    STRIPE_PUBLISHABLE_KEY: 'pk_test_abcdefghijklmnop1234',
    PAYMENT_PROVIDERS: 'stripe,snippe',
    SNIPPE_API_KEY: 'snp_abcdefghijklmnop1234',
    SNIPPE_WEBHOOK_SECRET: 'x'.repeat(32),
  }).join(), /Snippe has no sandbox/);
  assert.deepEqual(configProblems(livePayPalEnv), []);
  assert.match(configProblems({ ...livePayPalEnv, PAYPAL_WEBHOOK_ID: '' }).join(), /PAYPAL_WEBHOOK_ID is required/);
  assert.match(configProblems({ ...livePayPalEnv, PAYPAL_CURRENCIES: 'USD,TZS' }).join(), /TZS is not supported by PayPal/);
});

test('legacy config keeps the existing Pesapal-only deployment working', () => {
  const config = loadPaymentGatewayConfig({
    PESAPAL_CUSTOMER_KEY: 'key',
    PESAPAL_CUSTOMER_SECRET: 'secret',
    PESAPAL_ENV: 'live',
    PUBLIC_API_URL: 'https://api.example.com',
    WEB_CHECKOUT_CALLBACK_URL: 'https://shop.example.com/checkout/payment',
  });
  assert.equal(config.mode, 'legacy');
  assert.deepEqual(config.providers, [{ id: 'pesapal', currencies: ['TZS'] }]);
  assert.deepEqual(loadPaymentGatewayConfig({}).providers, []);
});

test('legacy live Pesapal config rejects non-public or insecure callback URLs', () => {
  const livePesapalEnv = {
    PESAPAL_CUSTOMER_KEY: 'key',
    PESAPAL_CUSTOMER_SECRET: 'secret',
    PESAPAL_ENV: 'live',
    PUBLIC_API_URL: 'https://api.example.com',
    WEB_CHECKOUT_CALLBACK_URL: 'https://shop.example.com/checkout/payment',
  };
  assert.match(configProblems({ ...livePesapalEnv, PUBLIC_API_URL: 'http://localhost:3000' }).join(), /PUBLIC_API_URL must use https/);
  assert.match(configProblems({ ...livePesapalEnv, PUBLIC_API_URL: 'https://localhost:3000' }).join(), /publicly reachable host/);
  assert.match(configProblems({ ...livePesapalEnv, WEB_CHECKOUT_CALLBACK_URL: 'http://shop.example.com/checkout/payment' }).join(), /WEB_CHECKOUT_CALLBACK_URL must use https/);
  assert.match(configProblems({ ...livePesapalEnv, WEB_CHECKOUT_CALLBACK_URL: 'https://127.0.0.1/checkout/payment' }).join(), /publicly reachable host/);
});

test('sandbox Pesapal may use local HTTP callback URLs for development', () => {
  const config = loadPaymentGatewayConfig({
    PESAPAL_CUSTOMER_KEY: 'key',
    PESAPAL_CUSTOMER_SECRET: 'secret',
    PESAPAL_ENV: 'sandbox',
    PUBLIC_API_URL: 'http://localhost:3000',
    WEB_CHECKOUT_CALLBACK_URL: 'http://localhost:3001/checkout/payment',
  });
  assert.equal(config.mode, 'legacy');
  assert.equal(config.environment, 'test');
});

test('Stripe webhook signatures reject tampering and replay', () => {
  const secret = 'whsec_test_secret_value_1234';
  const body = Buffer.from(JSON.stringify({ id: 'evt_1', type: 'checkout.session.completed' }));
  const now = 1_700_000_000;
  const signature = createHmac('sha256', secret).update(`${now}.`).update(body).digest('hex');
  const header = `t=${now},v1=${'0'.repeat(64)},v1=${signature}`;
  assert.equal(verifyStripeWebhook(body, header, secret, now).id, 'evt_1');
  assert.throws(() => verifyStripeWebhook(Buffer.from(`${body} `), header, secret, now), WebhookVerificationError);
  assert.throws(() => verifyStripeWebhook(body, header, secret, now + 301), /tolerance/);
  assert.throws(() => verifyStripeWebhook(body, undefined, secret, now), /Missing/);
});

test('Snippe webhook signatures reject tampering and replay', () => {
  const secret = 'y'.repeat(32);
  const body = Buffer.from(JSON.stringify({ type: 'payment.completed', data: { session_reference: 'sess_1' } }));
  const now = 1_700_000_000;
  const signature = createHmac('sha256', secret).update(`${now}.`).update(body).digest('hex');
  assert.equal(verifySnippeWebhook(body, signature, String(now), secret, now).type, 'payment.completed');
  assert.throws(() => verifySnippeWebhook(body, signature, String(now + 1), secret, now), /invalid/);
  assert.throws(() => verifySnippeWebhook(body, signature, String(now - 400), secret, now), /tolerance/);
});

test('Stripe amounts use exact minor units and payment page links carry the reference', () => {
  assert.equal(toStripeMinorUnits(12.34, 'USD'), 1234);
  assert.equal(toStripeMinorUnits(1500, 'JPY'), 1500);
  assert.throws(() => toStripeMinorUnits(12.345, 'USD'), /exactly/);
  assert.equal(stripePaymentPageUrl('https://shop.example.com/checkout/pay', 'saplaya-x'), 'https://shop.example.com/checkout/pay?tx_ref=saplaya-x');
});

function fakeFetch(responses: unknown[], calls: { url: string; init?: RequestInit }[] = []): typeof fetch {
  return (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    const body = responses.shift();
    return new Response(JSON.stringify(body), { status: 200 });
  }) as typeof fetch;
}

const stripeSettings = {
  id: 'stripe' as const,
  secretKey: 'sk_live_x',
  publishableKey: 'pk_live_x',
  webhookSecret: 'whsec_x',
  currencies: ['USD'],
  livemode: true,
  paymentPageUrl: 'https://shop.example.com/checkout/pay',
};

test('Stripe adapter creates PaymentIntents for the custom Elements page and maps verified status', async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  const intent = { id: 'pi_live00001', amount: 1234, currency: 'usd', metadata: { transaction_ref: 'saplaya-1' }, livemode: true };
  const stripe = new StripeProvider(stripeSettings, fakeFetch([
    { ...intent, status: 'requires_payment_method' },
    { ...intent, status: 'requires_payment_method', client_secret: 'pi_live00001_secret_abc' },
    { ...intent, status: 'succeeded', amount_received: 1234 },
  ], calls));
  const checkout = await stripe.createCheckout({
    reference: 'saplaya-1', amount: 12.34, currency: 'USD', description: 'Order',
    callbackUrl: 'https://api.example.com/payments/callback', webhookUrl: 'https://api.example.com/hook',
    customer: { name: 'Buyer', email: 'buyer@example.com', phone: '' },
  });
  assert.deepEqual(checkout, { gatewayId: 'pi_live00001', redirectUrl: 'https://shop.example.com/checkout/pay?tx_ref=saplaya-1' });
  assert.equal(calls[0].url, 'https://api.stripe.com/v1/payment_intents');
  const form = new URLSearchParams(String(calls[0].init?.body));
  assert.equal(form.get('amount'), '1234');
  assert.equal(form.get('automatic_payment_methods[enabled]'), 'true');
  assert.equal((calls[0].init?.headers as Record<string, string>)['Idempotency-Key'], 'saplaya-intent-saplaya-1');

  const session = await stripe.elementsSession('pi_live00001');
  assert.equal(session.clientSecret, 'pi_live00001_secret_abc');
  assert.equal(session.publishableKey, 'pk_live_x');
  assert.equal(session.state, 'pending');
  assert.deepEqual(await stripe.verify('pi_live00001'), {
    gatewayId: 'pi_live00001', reference: 'saplaya-1', state: 'paid', amount: 12.34, currency: 'USD',
  });

  const mismatched = new StripeProvider(stripeSettings, fakeFetch([{ ...intent, amount: 1 }]));
  await assert.rejects(mismatched.createCheckout({
    reference: 'saplaya-1', amount: 12.34, currency: 'USD', description: 'Order',
    callbackUrl: 'https://api.example.com/payments/callback', webhookUrl: 'https://api.example.com/hook',
    customer: { name: 'Buyer', email: 'buyer@example.com', phone: '' },
  }), /unexpected amount/);
  const foreignSecret = new StripeProvider(stripeSettings, fakeFetch([{ ...intent, client_secret: 'pi_other_secret_x' }]));
  await assert.rejects(foreignSecret.elementsSession('pi_live00001'), /incomplete/);
  const wrongMode = new StripeProvider(stripeSettings, fakeFetch([{ id: 'pi_test00001', livemode: false }]));
  await assert.rejects(wrongMode.verify('pi_test00001'), /wrong live\/test mode/);
  await assert.rejects(stripe.verify('cs_live_abc'), /Invalid Stripe PaymentIntent/);
});

test('Snippe adapter rejects untrusted checkout hosts', async () => {
  const snippe = new SnippeProvider(
    { id: 'snippe', apiKey: 'snp_x', webhookSecret: 'z'.repeat(32), currencies: ['TZS'] },
    fakeFetch([{ code: 201, data: { reference: 'sess_1', checkout_url: 'https://evil.example/pay', amount: 5000, currency: 'TZS' } }]),
  );
  await assert.rejects(snippe.createCheckout({
    reference: 'saplaya-1', amount: 5000, currency: 'TZS', description: 'Order',
    callbackUrl: 'https://api.example.com/payments/callback', webhookUrl: 'https://api.example.com/hook',
    customer: { name: 'Buyer', email: 'buyer@example.com', phone: '+255700000000' },
  }), /trusted domains/);
});

test('Snippe hosted checkout fixes the charge and re-verifies completed sessions', async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  const request = {
    reference: 'saplaya-1', amount: 5000, currency: 'TZS', description: 'Order',
    callbackUrl: 'https://api.example.com/payments/callback',
    webhookUrl: 'https://api.example.com/api/v1/payments/snippe-webhook',
    customer: { name: 'Buyer', email: 'buyer@example.com', phone: '+255700000000' },
  };
  const settings = { id: 'snippe' as const, apiKey: 'snp_x', webhookSecret: 'z'.repeat(32), currencies: ['TZS'] };
  const session = {
    reference: 'sess_checkout1', amount: 5000, currency: 'TZS',
    checkout_url: 'https://snippe.me/checkout/test', allow_custom_amount: false,
    metadata: { transaction_ref: request.reference },
  };
  const snippe = new SnippeProvider(settings, fakeFetch([
    { code: 201, data: { ...session, status: 'pending' } },
    { code: 200, data: { ...session, status: 'active' } },
    { code: 200, data: { ...session, status: 'completed' } },
    { code: 200, data: { ...session, status: 'expired' } },
  ], calls));
  assert.deepEqual(await snippe.createCheckout(request), {
    gatewayId: session.reference, redirectUrl: session.checkout_url,
  });
  assert.equal(calls[0].url, 'https://api.snippe.sh/api/v1/sessions');
  const body = JSON.parse(String(calls[0].init?.body));
  assert.equal(body.amount, 5000);
  assert.equal(body.allow_custom_amount, false);
  assert.deepEqual(body.allowed_methods, ['mobile_money']);
  assert.equal(body.redirect_url, 'https://api.example.com/payments/callback?tx_ref=saplaya-1');
  assert.equal(body.webhook_url, request.webhookUrl);
  assert.equal((calls[0].init?.headers as Record<string, string>)['Idempotency-Key'], request.reference);
  assert.equal((await snippe.verify(session.reference)).state, 'pending');
  assert.deepEqual(await snippe.verify(session.reference), {
    gatewayId: session.reference, reference: request.reference, state: 'paid', amount: 5000, currency: 'TZS',
  });
  assert.equal((await snippe.verify(session.reference)).state, 'failed');
  const customAmount = new SnippeProvider(settings, fakeFetch([
    { code: 201, data: { ...session, allow_custom_amount: true } },
  ]));
  await assert.rejects(customAmount.createCheckout(request), /change the charge/);
  const differentSession = new SnippeProvider(settings, fakeFetch([
    { code: 200, data: { ...session, reference: 'sess_other' } },
  ]));
  await assert.rejects(differentSession.verify(session.reference), /different session/);
  await assert.rejects(snippe.createCheckout({ ...request, amount: 499 }), /at least 500/);
});

test('PayPal creates an approval order, captures it once approved, and verifies its webhook', async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  const reference = 'saplaya-123e4567-e89b-12d3-a456-426614174000';
  const purchaseUnit = {
    reference_id: reference,
    custom_id: reference,
    amount: { currency_code: 'USD', value: '19.99' },
  };
  const paypal = new PayPalProvider({
    id: 'paypal',
    clientId: 'client-id-1234',
    clientSecret: 'paypal-secret-value',
    webhookId: 'webhook-id-1234',
    currencies: ['USD'],
    environment: 'live',
  }, fakeFetch([
    { access_token: 'access-token', expires_in: 3600 },
    {
      id: 'ORDER-123456789',
      purchase_units: [{ reference_id: reference, amount: purchaseUnit.amount }],
      links: [{ rel: 'approve', href: 'https://www.paypal.com/checkoutnow?token=ORDER-123456789' }],
    },
    { id: 'ORDER-123456789', status: 'APPROVED', purchase_units: [purchaseUnit] },
    {
      id: 'ORDER-123456789',
      status: 'COMPLETED',
      purchase_units: [{
        ...purchaseUnit,
        payments: { captures: [{ status: 'COMPLETED', amount: { currency_code: 'USD', value: '19.99' } }] },
      }],
    },
    { verification_status: 'SUCCESS' },
  ], calls));
  const checkout = await paypal.createCheckout({
    reference, amount: 19.99, currency: 'USD', description: 'Saplaya order',
    callbackUrl: 'https://api.example.com/payments/callback',
    webhookUrl: 'https://api.example.com/api/v1/payments/paypal-webhook',
    customer: { name: 'Buyer', email: 'buyer@example.com', phone: '' },
  });
  assert.deepEqual(checkout, {
    gatewayId: 'ORDER-123456789',
    redirectUrl: 'https://www.paypal.com/checkoutnow?token=ORDER-123456789',
  });
  const orderRequest = JSON.parse(String(calls[1].init?.body));
  assert.equal(orderRequest.intent, 'CAPTURE');
  assert.equal(orderRequest.purchase_units[0].amount.value, '19.99');
  assert.equal(orderRequest.purchase_units[0].custom_id, reference);
  assert.equal(orderRequest.payment_source.paypal.experience_context.return_url,
    `https://api.example.com/payments/callback?tx_ref=${reference}`);
  assert.match((calls[1].init?.headers as Record<string, string>)['PayPal-Request-Id'], /^sp-[a-f0-9]{32}$/);

  assert.deepEqual(await paypal.verify('ORDER-123456789'), {
    gatewayId: 'ORDER-123456789', reference, state: 'paid', amount: 19.99, currency: 'USD',
  });
  assert.equal(calls[3].url, 'https://api-m.paypal.com/v2/checkout/orders/ORDER-123456789/capture');
  assert.equal((calls[3].init?.headers as Record<string, string>)['PayPal-Request-Id'], 'spcap-ORDER-123456789');
  assert.deepEqual(await paypal.verifyWebhook(Buffer.from(JSON.stringify({ id: 'event-1' })), {
    transmissionId: 'transmission-1',
    transmissionTime: '2026-11-25T00:00:00Z',
    certUrl: 'https://api.paypal.com/cert',
    authAlgo: 'SHA256withRSA',
    transmissionSig: 'signature',
  }), { id: 'event-1' });
  const webhookRequest = JSON.parse(String(calls[4].init?.body));
  assert.equal(webhookRequest.webhook_id, 'webhook-id-1234');
  assert.equal(webhookRequest.webhook_event.id, 'event-1');

  await assert.rejects(paypal.verify('ORDER-123456789?redirect=elsewhere'), /Invalid PayPal order ID/);
});

function stubProvider(id: 'stripe' | 'pesapal', currencies: string[], verified?: VerifiedPayment): PaymentProvider {
  return {
    id, label: id, methods: [], currencies, requiresPhone: id === 'pesapal',
    channels: id === 'pesapal' ? ['mobile_money', 'cards'] : ['cards'],
    createCheckout: async () => ({ gatewayId: 'gw', redirectUrl: 'https://pay.example' }),
    verify: async () => verified!,
  };
}

test('gateway routes by priority and skips providers that are not ready', async () => {
  const config = { mode: 'explicit' as const, environment: 'live' as const, providers: [] };
  const gateway = new PaymentGateway(config, { loadPesapalIpnId: async () => null }, [
    stubProvider('pesapal', ['TZS']),
    stubProvider('stripe', ['USD', 'TZS']),
  ]);
  assert.equal((await gateway.select('TZS') as PaymentProvider).id, 'stripe');
  assert.match((await gateway.select('TZS', 'pesapal') as { error: string }).error, /not available/);
  assert.match((await gateway.select('KES') as { error: string }).error, /not supported/);
});

test('settlement only completes orders that match the stored amount, currency and provider', async () => {
  const payment: StoredPayment = {
    transaction_ref: 'saplaya-1', provider: 'stripe', gateway_transaction_id: 'pi_live00001',
    payment_amount: '12.34', currency: 'USD', status: 'pending', order_id: null,
  };
  const completed: string[] = [];
  const failed: string[] = [];
  const store: SettlementStore = {
    markFailed: async (ref) => { failed.push(ref); },
    complete: async (ref, provider, gatewayId) => { completed.push(`${ref}:${provider}:${gatewayId}`); return 'order-1'; },
  };
  const gatewayFor = (verified: VerifiedPayment) => new PaymentGateway(
    { mode: 'explicit', environment: 'live', providers: [] },
    { loadPesapalIpnId: async () => null },
    [stubProvider('stripe', ['USD'], verified)],
  );
  const paid = { gatewayId: 'pi_live00001', reference: 'saplaya-1', state: 'paid' as const, amount: 12.34, currency: 'USD' };

  assert.deepEqual(await settlePayment(gatewayFor({ ...paid, amount: 12.33 }), store, payment), {
    outcome: 'mismatch', reason: 'Paid amount does not match the checkout.',
  });
  assert.equal((await settlePayment(gatewayFor({ ...paid, reference: 'saplaya-2' }), store, payment)).outcome, 'mismatch');
  assert.deepEqual(completed, []);
  assert.deepEqual(await settlePayment(gatewayFor({ ...paid, state: 'pending' }), store, payment), { outcome: 'pending' });
  assert.deepEqual(await settlePayment(gatewayFor({ ...paid, state: 'failed' }), store, payment), { outcome: 'failed' });
  assert.deepEqual(failed, ['saplaya-1']);
  assert.deepEqual(await settlePayment(gatewayFor(paid), store, payment), { outcome: 'paid', orderId: 'order-1' });
  assert.deepEqual(completed, ['saplaya-1:stripe:pi_live00001']);
});

test('payment gateway migration records the provider on paid orders', async () => {
  const sql = await readFile(new URL('../../supabase/migrations/20261117100000_payment_gateway_providers.sql', import.meta.url), 'utf8');
  assert.match(sql, /check \(provider in \('pesapal', 'stripe', 'snippe'\)\)/);
  assert.match(sql, /payment_method = v_payment\.provider/);
  assert.match(sql, /v_payment\.provider is distinct from p_provider/);
  assert.match(sql, /grant execute on function public\.complete_checkout_payment\(text, text, text\) to service_role/);
  const paypalSql = await readFile(new URL('../../supabase/migrations/20261125090000_paypal_payment_provider.sql', import.meta.url), 'utf8');
  assert.match(paypalSql, /check \(provider in \('pesapal', 'stripe', 'snippe', 'paypal'\)\)/);
  assert.match(paypalSql, /payment_method in \('pesapal', 'stripe', 'snippe', 'paypal', 'cash_on_delivery'\)/);
  assert.match(paypalSql, /if p_provider not in \('pesapal', 'stripe', 'snippe', 'paypal'\)/);
});
