import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { amountInMinorUnits, currencyFractionDigits } from '../currency.js';
import {
  getTransactionStatus,
  isPaymentCompleted,
  isPaymentFailed,
  submitOrder,
} from '../pesapal.js';
import {
  stripeCurrencyExponent,
  type PaymentProviderId,
  type PayPalSettings,
  type PesapalSettings,
  type SnippeSettings,
  type StripeSettings,
} from './config.js';

export type PaymentState = 'paid' | 'failed' | 'pending';

export type CheckoutRequest = {
  reference: string;
  amount: number;
  currency: string;
  description: string;
  callbackUrl: string;
  webhookUrl: string;
  customer: { name: string; email: string; phone: string };
  deliveryAddress?: string;
};

export type CreatedCheckout = { gatewayId: string; redirectUrl: string };

export type VerifiedPayment = {
  gatewayId: string;
  reference?: string;
  state: PaymentState;
  amount?: number;
  currency?: string;
};

export type PaymentChannel = 'mobile_money' | 'cards' | 'other';

export interface PaymentProvider {
  readonly id: PaymentProviderId;
  readonly label: string;
  readonly channels: PaymentChannel[];
  readonly methods: string[];
  readonly currencies: string[];
  readonly requiresPhone: boolean;
  createCheckout(request: CheckoutRequest): Promise<CreatedCheckout>;
  verify(gatewayId: string): Promise<VerifiedPayment>;
}

export function checkoutProviderPresentation(
  provider: Pick<PaymentProvider, 'id' | 'methods'>,
): { label: string; methods: string[] } {
  switch (provider.id) {
    case 'stripe':
      return { label: 'Cards & wallets', methods: ['Cards, digital wallets and other enabled methods'] };
    case 'snippe':
      return { label: 'Mobile money', methods: provider.methods };
    case 'pesapal':
      return { label: 'Secure checkout', methods: ['Cards', 'Mobile money'] };
    case 'paypal':
      return { label: 'Digital wallet & cards', methods: ['Wallet balance, cards and supported local methods'] };
  }
}

export class PaymentProviderError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = 'PaymentProviderError';
  }
}

export class WebhookVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WebhookVerificationError';
  }
}

type FetchLike = typeof fetch;
type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

async function readJson(response: Response, provider: string): Promise<JsonObject> {
  const text = await response.text();
  let parsed: unknown;
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    throw new PaymentProviderError(`${provider} returned a non-JSON response (${response.status}).`, response.status);
  }
  if (!isObject(parsed)) {
    throw new PaymentProviderError(`${provider} returned an invalid response (${response.status}).`, response.status);
  }
  return parsed;
}

function requireHttpsUrl(raw: unknown, allowedHosts: string[], provider: string): string {
  if (typeof raw !== 'string') throw new PaymentProviderError(`${provider} did not return a checkout URL.`);
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new PaymentProviderError(`${provider} returned an invalid checkout URL.`);
  }
  const hostAllowed = allowedHosts.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`));
  if (url.protocol !== 'https:' || url.username || url.password || !hostAllowed) {
    throw new PaymentProviderError(`${provider} returned a checkout URL outside its trusted domains.`);
  }
  return url.toString();
}

function secureCompareHex(expected: string, provided: string): boolean {
  const expectedBuffer = Buffer.from(expected, 'utf8');
  const providedBuffer = Buffer.from(provided, 'utf8');
  return expectedBuffer.length === providedBuffer.length && timingSafeEqual(expectedBuffer, providedBuffer);
}

function checkTimestamp(timestamp: number, nowSeconds: number, toleranceSeconds: number) {
  if (!Number.isSafeInteger(timestamp) || Math.abs(nowSeconds - timestamp) > toleranceSeconds) {
    throw new WebhookVerificationError('Webhook timestamp is outside the allowed tolerance.');
  }
}

function parseVerifiedBody(rawBody: Buffer): JsonObject {
  try {
    const parsed: unknown = JSON.parse(rawBody.toString('utf8'));
    if (isObject(parsed)) return parsed;
  } catch {
    // Fall through to the uniform error below.
  }
  throw new WebhookVerificationError('Webhook body is not a JSON object.');
}

export function verifyStripeWebhook(
  rawBody: Buffer,
  signatureHeader: string | undefined,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
  toleranceSeconds = 300,
): JsonObject {
  if (!signatureHeader) throw new WebhookVerificationError('Missing Stripe-Signature header.');
  let timestamp: number | undefined;
  const signatures: string[] = [];
  for (const part of signatureHeader.split(',')) {
    const [key, ...rest] = part.trim().split('=');
    const item = rest.join('=');
    if (key === 't') timestamp = Number(item);
    if (key === 'v1' && /^[0-9a-f]{64}$/.test(item)) signatures.push(item);
  }
  if (timestamp === undefined || !signatures.length) {
    throw new WebhookVerificationError('Stripe-Signature header is malformed.');
  }
  checkTimestamp(timestamp, nowSeconds, toleranceSeconds);
  const expected = createHmac('sha256', secret)
    .update(`${timestamp}.`)
    .update(rawBody)
    .digest('hex');
  if (!signatures.some((signature) => secureCompareHex(expected, signature))) {
    throw new WebhookVerificationError('Stripe webhook signature is invalid.');
  }
  return parseVerifiedBody(rawBody);
}

export function verifySnippeWebhook(
  rawBody: Buffer,
  signature: string | undefined,
  timestampHeader: string | undefined,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
  toleranceSeconds = 300,
): JsonObject {
  if (!signature || !timestampHeader || !/^\d{1,12}$/.test(timestampHeader) || !/^[0-9a-f]{64}$/i.test(signature)) {
    throw new WebhookVerificationError('Snippe webhook signature headers are missing or malformed.');
  }
  const timestamp = Number(timestampHeader);
  checkTimestamp(timestamp, nowSeconds, toleranceSeconds);
  const expected = createHmac('sha256', secret)
    .update(`${timestampHeader}.`)
    .update(rawBody)
    .digest('hex');
  if (!secureCompareHex(expected, signature.toLowerCase())) {
    throw new WebhookVerificationError('Snippe webhook signature is invalid.');
  }
  return parseVerifiedBody(rawBody);
}

const STRIPE_API = 'https://api.stripe.com/v1';
const STRIPE_API_VERSION = '2024-06-20';

export function toStripeMinorUnits(amount: number, currency: string): number {
  const minor = amountInMinorUnits(amount, currency);
  if (minor === null || minor <= 0) {
    throw new PaymentProviderError(`The ${currency} amount cannot be charged exactly.`);
  }
  // Config rejects currencies whose ISO exponent differs from Stripe's, so ISO minor units are Stripe units.
  return minor;
}

export function fromStripeMinorUnits(amount: number, currency: string): number {
  return amount / 10 ** stripeCurrencyExponent(currency);
}

export function stripePaymentPageUrl(pageUrl: string, reference: string): string {
  const url = new URL(pageUrl);
  url.searchParams.set('tx_ref', reference);
  return url.toString();
}

export function stripeIntentState(intent: JsonObject): PaymentState {
  if (intent.status === 'succeeded') return 'paid';
  if (intent.status === 'canceled') return 'failed';
  return 'pending';
}

export type StripeElementsSession = {
  clientSecret: string;
  publishableKey: string;
  state: PaymentState;
  status: string;
  amount: number;
  currency: string;
  reference?: string;
};

const STRIPE_INTENT_ID = /^pi_[A-Za-z0-9]{8,}$/;

export class StripeProvider implements PaymentProvider {
  readonly id = 'stripe' as const;
  readonly label = 'Card & wallets';
  readonly channels: PaymentChannel[] = ['cards', 'other'];
  readonly methods = ['card', 'wallets', 'local payment methods enabled in Stripe'];
  readonly requiresPhone = false;
  readonly currencies: string[];

  constructor(private readonly settings: StripeSettings, private readonly fetchImpl: FetchLike = fetch) {
    this.currencies = settings.currencies;
  }

  private async call(path: string, init: { method: 'GET' | 'POST'; body?: URLSearchParams; idempotencyKey?: string }) {
    const response = await this.fetchImpl(`${STRIPE_API}${path}`, {
      method: init.method,
      signal: AbortSignal.timeout(20_000),
      headers: {
        Authorization: `Bearer ${this.settings.secretKey}`,
        'Stripe-Version': STRIPE_API_VERSION,
        ...(init.body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
        ...(init.idempotencyKey ? { 'Idempotency-Key': init.idempotencyKey } : {}),
      },
      body: init.body?.toString(),
    });
    const body = await readJson(response, 'Stripe');
    if (!response.ok) {
      const error = isObject(body.error) ? body.error : {};
      const code = typeof error.code === 'string' ? ` (${error.code})` : '';
      throw new PaymentProviderError(`Stripe request failed with HTTP ${response.status}${code}.`, response.status);
    }
    if (body.livemode !== undefined && body.livemode !== this.settings.livemode) {
      throw new PaymentProviderError('Stripe returned an object from the wrong live/test mode.');
    }
    return body;
  }

  private async retrieveIntent(gatewayId: string) {
    if (!STRIPE_INTENT_ID.test(gatewayId)) throw new PaymentProviderError('Invalid Stripe PaymentIntent ID.');
    const intent = await this.call(`/payment_intents/${encodeURIComponent(gatewayId)}`, { method: 'GET' });
    if (intent.id !== gatewayId) throw new PaymentProviderError('Stripe returned a different PaymentIntent.');
    return intent;
  }

  async createCheckout(request: CheckoutRequest): Promise<CreatedCheckout> {
    const currency = request.currency.toUpperCase();
    if (!this.currencies.includes(currency)) {
      throw new PaymentProviderError(`Stripe is not configured for ${currency}.`);
    }
    const amount = toStripeMinorUnits(request.amount, currency);
    const form = new URLSearchParams({
      amount: String(amount),
      currency: currency.toLowerCase(),
      'automatic_payment_methods[enabled]': 'true',
      description: request.description,
      receipt_email: request.customer.email,
      'metadata[transaction_ref]': request.reference,
    });
    const intent = await this.call('/payment_intents', {
      method: 'POST',
      body: form,
      idempotencyKey: `saplaya-intent-${request.reference}`,
    });
    if (typeof intent.id !== 'string' || !STRIPE_INTENT_ID.test(intent.id)) {
      throw new PaymentProviderError('Stripe did not return a PaymentIntent ID.');
    }
    const metadata = isObject(intent.metadata) ? intent.metadata : {};
    if (metadata.transaction_ref !== request.reference) {
      throw new PaymentProviderError('Stripe returned a PaymentIntent for a different reference.');
    }
    if (intent.amount !== amount || String(intent.currency).toUpperCase() !== currency) {
      throw new PaymentProviderError('Stripe created a PaymentIntent with an unexpected amount or currency.');
    }
    return { gatewayId: intent.id, redirectUrl: stripePaymentPageUrl(this.settings.paymentPageUrl, request.reference) };
  }

  /** Data the Saplaya payment page needs to mount Stripe Elements for an existing PaymentIntent. */
  async elementsSession(gatewayId: string): Promise<StripeElementsSession> {
    const intent = await this.retrieveIntent(gatewayId);
    const currency = typeof intent.currency === 'string' ? intent.currency.toUpperCase() : '';
    if (typeof intent.client_secret !== 'string' || !intent.client_secret.startsWith(`${gatewayId}_secret_`)
      || typeof intent.amount !== 'number' || !currency) {
      throw new PaymentProviderError('Stripe returned an incomplete PaymentIntent.');
    }
    const metadata = isObject(intent.metadata) ? intent.metadata : {};
    return {
      clientSecret: intent.client_secret,
      publishableKey: this.settings.publishableKey,
      state: stripeIntentState(intent),
      status: String(intent.status),
      amount: fromStripeMinorUnits(intent.amount, currency),
      currency,
      reference: typeof metadata.transaction_ref === 'string' ? metadata.transaction_ref : undefined,
    };
  }

  async verify(gatewayId: string): Promise<VerifiedPayment> {
    const intent = await this.retrieveIntent(gatewayId);
    const currency = typeof intent.currency === 'string' ? intent.currency.toUpperCase() : undefined;
    const state = stripeIntentState(intent);
    const minor = state === 'paid' ? intent.amount_received : intent.amount;
    const metadata = isObject(intent.metadata) ? intent.metadata : {};
    return {
      gatewayId,
      reference: typeof metadata.transaction_ref === 'string' ? metadata.transaction_ref : undefined,
      state,
      amount: typeof minor === 'number' && currency ? fromStripeMinorUnits(minor, currency) : undefined,
      currency,
    };
  }
}

const SNIPPE_API = 'https://api.snippe.sh';

export function snippeSessionState(status: unknown): PaymentState {
  if (status === 'completed') return 'paid';
  if (status === 'expired' || status === 'cancelled' || status === 'failed') return 'failed';
  return 'pending';
}

export class SnippeProvider implements PaymentProvider {
  readonly id = 'snippe' as const;
  readonly label = 'Mobile money';
  readonly channels: PaymentChannel[] = ['mobile_money'];
  readonly methods = ['M-Pesa', 'Airtel Money', 'Mixx by Yas', 'Halotel'];
  readonly requiresPhone = true;
  readonly currencies: string[];

  constructor(private readonly settings: SnippeSettings, private readonly fetchImpl: FetchLike = fetch) {
    this.currencies = settings.currencies;
  }

  private async call(path: string, init: { method: 'GET' | 'POST'; body?: JsonObject; idempotencyKey?: string }) {
    const response = await this.fetchImpl(`${SNIPPE_API}${path}`, {
      method: init.method,
      signal: AbortSignal.timeout(20_000),
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${this.settings.apiKey}`,
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(init.idempotencyKey ? { 'Idempotency-Key': init.idempotencyKey } : {}),
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
    });
    const body = await readJson(response, 'Snippe');
    if (!response.ok || body.status === 'error') {
      const code = typeof body.error_code === 'string' ? ` (${body.error_code})` : '';
      throw new PaymentProviderError(`Snippe request failed with HTTP ${response.status}${code}.`, response.status);
    }
    if (!isObject(body.data)) throw new PaymentProviderError('Snippe response did not contain data.');
    return body.data;
  }

  async createCheckout(request: CheckoutRequest): Promise<CreatedCheckout> {
    if (request.currency !== 'TZS' || !Number.isSafeInteger(request.amount)) {
      throw new PaymentProviderError('Snippe only accepts whole TZS amounts.');
    }
    if (request.amount < 500) throw new PaymentProviderError('Snippe requires at least 500 TZS.');
    const callback = new URL(request.callbackUrl);
    callback.searchParams.set('tx_ref', request.reference);
    const session = await this.call('/api/v1/sessions', {
      method: 'POST',
      idempotencyKey: request.reference,
      body: {
        amount: request.amount,
        currency: 'TZS',
        allowed_methods: ['mobile_money'],
        allow_custom_amount: false,
        customer: {
          name: request.customer.name.slice(0, 200),
          phone: request.customer.phone,
          email: request.customer.email,
        },
        redirect_url: callback.toString(),
        webhook_url: request.webhookUrl,
        description: request.description.slice(0, 500),
        metadata: { transaction_ref: request.reference },
        expires_in: 3600,
        ...(this.settings.profileId ? { profile_id: this.settings.profileId } : {}),
      },
    });
    if (typeof session.reference !== 'string' || !session.reference.trim()) {
      throw new PaymentProviderError('Snippe did not return a session reference.');
    }
    if (session.amount !== request.amount || session.currency !== 'TZS') {
      throw new PaymentProviderError('Snippe created a session with an unexpected amount or currency.');
    }
    if (session.allow_custom_amount === true) {
      throw new PaymentProviderError('Snippe returned a session that allows the customer to change the charge.');
    }
    return {
      gatewayId: session.reference,
      redirectUrl: requireHttpsUrl(session.checkout_url, ['snippe.me', 'snippe.sh'], 'Snippe'),
    };
  }

  async verify(gatewayId: string): Promise<VerifiedPayment> {
    if (!/^[A-Za-z0-9_-]{4,120}$/.test(gatewayId)) throw new PaymentProviderError('Invalid Snippe session reference.');
    const session = await this.call(`/api/v1/sessions/${encodeURIComponent(gatewayId)}`, { method: 'GET' });
    if (session.reference !== gatewayId) throw new PaymentProviderError('Snippe returned a different session.');
    const metadata = isObject(session.metadata) ? session.metadata : {};
    return {
      gatewayId,
      reference: typeof metadata.transaction_ref === 'string' ? metadata.transaction_ref : undefined,
      state: snippeSessionState(session.status),
      amount: typeof session.amount === 'number' ? session.amount : undefined,
      currency: typeof session.currency === 'string' ? session.currency.toUpperCase() : undefined,
    };
  }
}

  const PAYPAL_ORDER_ID = /^[A-Za-z0-9-]{8,64}$/;

  export class PayPalProvider implements PaymentProvider {
    readonly id = 'paypal' as const;
    readonly label = 'PayPal';
    readonly channels: PaymentChannel[] = ['cards', 'other'];
    readonly methods = ['PayPal balance, cards and eligible local payment methods'];
    readonly requiresPhone = false;
    readonly currencies: string[];
    private readonly apiUrl: string;
    private token = '';
    private tokenExpiresAt = 0;
    private tokenRequest: Promise<string> | null = null;

    constructor(private readonly settings: PayPalSettings, private readonly fetchImpl: FetchLike = fetch) {
      this.currencies = settings.currencies;
      this.apiUrl = settings.environment === 'live'
        ? 'https://api-m.paypal.com'
        : 'https://api-m.sandbox.paypal.com';
    }

    private async accessToken(): Promise<string> {
      if (this.token && Date.now() < this.tokenExpiresAt) return this.token;
      if (this.tokenRequest) return this.tokenRequest;
      this.tokenRequest = (async () => {
        const response = await this.fetchImpl(`${this.apiUrl}/v1/oauth2/token`, {
          method: 'POST',
          signal: AbortSignal.timeout(20_000),
          headers: {
            Authorization: `Basic ${Buffer.from(`${this.settings.clientId}:${this.settings.clientSecret}`).toString('base64')}`,
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: 'application/json',
          },
          body: 'grant_type=client_credentials',
        });
        const body = await readJson(response, 'PayPal');
        if (!response.ok) throw new PaymentProviderError(`PayPal authentication failed with HTTP ${response.status}.`, response.status);
        if (typeof body.access_token !== 'string' || typeof body.expires_in !== 'number') {
          throw new PaymentProviderError('PayPal returned an invalid access token response.');
        }
        this.token = body.access_token;
        this.tokenExpiresAt = Date.now() + Math.max(0, body.expires_in - 60) * 1000;
        return this.token;
      })();
      try {
        return await this.tokenRequest;
      } finally {
        this.tokenRequest = null;
      }
    }

    private async call(path: string, init: { method: 'GET' | 'POST'; body?: JsonObject; requestId?: string }) {
      const token = await this.accessToken();
      const response = await this.fetchImpl(`${this.apiUrl}${path}`, {
        method: init.method,
        signal: AbortSignal.timeout(20_000),
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
          ...(init.body ? { 'Content-Type': 'application/json' } : {}),
          ...(init.requestId ? { 'PayPal-Request-Id': init.requestId } : {}),
        },
        body: init.body ? JSON.stringify(init.body) : undefined,
      });
      const body = await readJson(response, 'PayPal');
      if (!response.ok) {
        const issue = typeof body.name === 'string' ? ` (${body.name})` : '';
        throw new PaymentProviderError(`PayPal request failed with HTTP ${response.status}${issue}.`, response.status);
      }
      return body;
    }

    private amountValue(amount: number, currency: string): string {
      const minorUnits = amountInMinorUnits(amount, currency);
      if (minorUnits === null || minorUnits <= 0) {
        throw new PaymentProviderError(`The ${currency} amount cannot be charged exactly.`);
      }
      return (minorUnits / 10 ** currencyFractionDigits(currency)).toFixed(currencyFractionDigits(currency));
    }

    async createCheckout(request: CheckoutRequest): Promise<CreatedCheckout> {
      const currency = request.currency.toUpperCase();
      if (!this.currencies.includes(currency)) {
        throw new PaymentProviderError(`PayPal is not configured for ${currency}.`);
      }
      const callback = new URL(request.callbackUrl);
      callback.searchParams.set('tx_ref', request.reference);
      const body = await this.call('/v2/checkout/orders', {
        method: 'POST',
        requestId: `sp-${createHash('sha256').update(request.reference).digest('hex').slice(0, 32)}`,
        body: {
          intent: 'CAPTURE',
          purchase_units: [{
            reference_id: request.reference,
            custom_id: request.reference,
            invoice_id: request.reference,
            description: request.description.slice(0, 127),
            amount: { currency_code: currency, value: this.amountValue(request.amount, currency) },
          }],
          payment_source: {
            paypal: {
              experience_context: {
                brand_name: 'Saplaya',
                user_action: 'PAY_NOW',
                shipping_preference: 'NO_SHIPPING',
                return_url: callback.toString(),
                cancel_url: callback.toString(),
              },
            },
          },
        },
      });
      const orderId = typeof body.id === 'string' ? body.id : '';
      if (!PAYPAL_ORDER_ID.test(orderId)) throw new PaymentProviderError('PayPal did not return a valid order ID.');
      const units = Array.isArray(body.purchase_units) ? body.purchase_units : [];
      const unit = isObject(units[0]) ? units[0] : {};
      const orderAmount = isObject(unit.amount) ? unit.amount : {};
      const returnedReference = typeof unit.custom_id === 'string' ? unit.custom_id : unit.reference_id;
      if (returnedReference !== request.reference
        || orderAmount.currency_code !== currency || orderAmount.value !== this.amountValue(request.amount, currency)) {
        throw new PaymentProviderError('PayPal created an order with an unexpected reference, amount or currency.');
      }
      const links = Array.isArray(body.links) ? body.links : [];
      const approvalLink = links.find((link) => isObject(link) && (link.rel === 'approve' || link.rel === 'payer-action'));
      return {
        gatewayId: orderId,
        redirectUrl: requireHttpsUrl(isObject(approvalLink) ? approvalLink.href : undefined, ['paypal.com'], 'PayPal'),
      };
    }

    async verify(gatewayId: string): Promise<VerifiedPayment> {
      if (!PAYPAL_ORDER_ID.test(gatewayId)) throw new PaymentProviderError('Invalid PayPal order ID.');
      let order = await this.call(`/v2/checkout/orders/${encodeURIComponent(gatewayId)}`, { method: 'GET' });
      if (order.id !== gatewayId) throw new PaymentProviderError('PayPal returned a different order.');
      if (order.status === 'APPROVED') {
        order = await this.call(`/v2/checkout/orders/${encodeURIComponent(gatewayId)}/capture`, {
          method: 'POST',
          body: {},
          requestId: `spcap-${gatewayId}`,
        });
        if (order.id !== gatewayId) throw new PaymentProviderError('PayPal captured a different order.');
      }
      const units = Array.isArray(order.purchase_units) ? order.purchase_units : [];
      if (units.length !== 1 || !isObject(units[0])) {
        throw new PaymentProviderError('PayPal order does not contain exactly one purchase unit.');
      }
      const unit = units[0];
      const payments = isObject(unit.payments) ? unit.payments : {};
      const captures = Array.isArray(payments.captures) ? payments.captures : [];
      const completedCaptures = captures.filter((capture) => isObject(capture) && capture.status === 'COMPLETED');
      const currency = completedCaptures.length && isObject(completedCaptures[0].amount)
        && typeof completedCaptures[0].amount.currency_code === 'string'
        ? completedCaptures[0].amount.currency_code.toUpperCase()
        : isObject(unit.amount) && typeof unit.amount.currency_code === 'string'
          ? unit.amount.currency_code.toUpperCase()
          : undefined;
      const amount = completedCaptures.length
        ? completedCaptures.reduce((sum, capture) => {
          const captureAmount = isObject(capture) && isObject(capture.amount) ? Number(capture.amount.value) : NaN;
          return sum + (Number.isFinite(captureAmount) ? captureAmount : 0);
        }, 0)
        : undefined;
      const state: PaymentState = order.status === 'COMPLETED' && completedCaptures.length === captures.length && captures.length > 0
        ? 'paid'
        : order.status === 'VOIDED' ? 'failed' : 'pending';
      const reference = typeof unit.custom_id === 'string' ? unit.custom_id
        : typeof unit.reference_id === 'string' ? unit.reference_id : undefined;
      return { gatewayId, reference, state, amount, currency };
    }

    async verifyWebhook(rawBody: Buffer, headers: {
      transmissionId?: string;
      transmissionTime?: string;
      certUrl?: string;
      authAlgo?: string;
      transmissionSig?: string;
    }): Promise<JsonObject | null> {
      const event = parseVerifiedBody(rawBody);
      if (!headers.transmissionId || !headers.transmissionTime || !headers.certUrl
        || !headers.authAlgo || !headers.transmissionSig) {
        throw new WebhookVerificationError('PayPal webhook signature headers are missing.');
      }
      const result = await this.call('/v1/notifications/verify-webhook-signature', {
        method: 'POST',
        body: {
          auth_algo: headers.authAlgo,
          cert_url: headers.certUrl,
          transmission_id: headers.transmissionId,
          transmission_sig: headers.transmissionSig,
          transmission_time: headers.transmissionTime,
          webhook_id: this.settings.webhookId,
          webhook_event: event,
        },
      });
      if (result.verification_status !== 'SUCCESS') return null;
      return event;
    }
  }

export class PesapalProvider implements PaymentProvider {
  readonly id = 'pesapal' as const;
  readonly label = 'Pesapal (mobile money & cards)';
  readonly channels: PaymentChannel[] = ['mobile_money', 'cards'];
  readonly methods = ['mobile money', 'cards'];
  readonly requiresPhone = true;
  readonly currencies: string[];

  constructor(settings: PesapalSettings, private readonly loadIpnId: () => Promise<string | null>) {
    this.currencies = settings.currencies;
  }

  async createCheckout(request: CheckoutRequest): Promise<CreatedCheckout> {
    const ipnId = await this.loadIpnId();
    if (!ipnId) throw new PaymentProviderError('Pesapal notifications have not been configured.');
    const order = await submitOrder({
      reference: request.reference,
      amount: request.amount,
      currency: request.currency,
      callbackUrl: request.callbackUrl,
      ipnId,
      email: request.customer.email,
      phone: request.customer.phone,
      name: request.customer.name,
      deliveryAddress: request.deliveryAddress,
    });
    if (order.merchant_reference !== request.reference) {
      throw new PaymentProviderError('Pesapal returned a merchant reference that does not match this checkout.');
    }
    return { gatewayId: order.order_tracking_id, redirectUrl: order.redirect_url };
  }

  async verify(gatewayId: string): Promise<VerifiedPayment> {
    const status = await getTransactionStatus(gatewayId);
    if (status.order_tracking_id && status.order_tracking_id !== gatewayId) {
      throw new PaymentProviderError('Pesapal returned a different transaction.');
    }
    const state: PaymentState = isPaymentCompleted(status) ? 'paid' : isPaymentFailed(status) ? 'failed' : 'pending';
    const amount = status.amount === undefined ? undefined : Number(status.amount);
    return {
      gatewayId,
      reference: status.merchant_reference,
      state,
      amount: Number.isFinite(amount) ? amount : undefined,
      currency: status.currency?.toUpperCase(),
    };
  }
}
