import { currencyFractionDigits, supportedPaymentCurrencies } from '../currency.js';

export const PAYMENT_PROVIDER_IDS = ['stripe', 'snippe', 'pesapal', 'paypal'] as const;
export type PaymentProviderId = (typeof PAYMENT_PROVIDER_IDS)[number];
export type PaymentEnvironment = 'live' | 'test';

export type StripeSettings = {
  id: 'stripe';
  secretKey: string;
  publishableKey: string;
  webhookSecret: string;
  currencies: string[];
  livemode: boolean;
  paymentPageUrl: string;
};

export type SnippeSettings = {
  id: 'snippe';
  apiKey: string;
  webhookSecret: string;
  currencies: string[];
  profileId?: string;
};

export type PesapalSettings = {
  id: 'pesapal';
  currencies: string[];
};

export type PayPalSettings = {
  id: 'paypal';
  clientId: string;
  clientSecret: string;
  webhookId: string;
  currencies: string[];
  environment: PaymentEnvironment;
};

export type ProviderSettings = StripeSettings | SnippeSettings | PesapalSettings | PayPalSettings;

export type PaymentGatewayConfig = {
  // Explicit mode is enabled by PAYMENT_PROVIDERS; legacy mode preserves the Pesapal-only deployment.
  mode: 'explicit' | 'legacy';
  environment: PaymentEnvironment;
  publicApiUrl?: string;
  providers: ProviderSettings[];
};

export class PaymentConfigurationError extends Error {
  constructor(readonly problems: string[]) {
    super(`Payment gateway configuration is invalid:\n- ${problems.join('\n- ')}`);
    this.name = 'PaymentConfigurationError';
  }
}

// Stripe expresses these currencies without minor units.
export const STRIPE_ZERO_DECIMAL = new Set([
  'BIF', 'CLP', 'DJF', 'GNF', 'JPY', 'KMF', 'KRW', 'MGA', 'PYG', 'RWF', 'VND', 'VUV', 'XAF', 'XOF', 'XPF',
]);
// Stripe applies rounding rules to these currencies that the exact-charge check cannot guarantee.
const STRIPE_SPECIAL_CASE = new Set(['ISK', 'HUF', 'TWD', 'UGX', 'BHD', 'JOD', 'KWD', 'OMR', 'TND']);

export function stripeCurrencyExponent(currency: string): number {
  return STRIPE_ZERO_DECIMAL.has(currency) ? 0 : 2;
}

type Env = Record<string, string | undefined>;

function value(env: Env, name: string): string | undefined {
  const raw = env[name];
  return raw === undefined ? undefined : raw.trim() || undefined;
}

function parseCurrencyList(raw: string, setting: string, problems: string[]): string[] {
  try {
    const currencies = supportedPaymentCurrencies(raw);
    if (!currencies.length) problems.push(`${setting} must list at least one currency.`);
    return currencies;
  } catch (error) {
    problems.push(`${setting}: ${(error as Error).message}`);
    return [];
  }
}

function requireSecret(
  env: Env,
  name: string,
  problems: string[],
  check: (secret: string) => string | null,
): string {
  const secret = value(env, name);
  if (!secret) {
    problems.push(`${name} is required.`);
    return '';
  }
  if (/\s/.test(secret)) {
    problems.push(`${name} must not contain whitespace.`);
    return '';
  }
  const problem = check(secret);
  if (problem) problems.push(`${name} ${problem}`);
  return secret;
}

function stripeSettings(env: Env, environment: PaymentEnvironment, problems: string[]): StripeSettings {
  const livemode = environment === 'live';
  const secretKey = requireSecret(env, 'STRIPE_SECRET_KEY', problems, (key) => {
    const match = /^(sk|rk)_(live|test)_[A-Za-z0-9]{16,}$/.exec(key);
    if (!match) return 'must be a Stripe secret (sk_) or restricted (rk_) API key.';
    if ((match[2] === 'live') !== livemode) {
      return `is a ${match[2]} key but PAYMENT_ENVIRONMENT is "${environment}".`;
    }
    return null;
  });
  const publishableKey = requireSecret(env, 'STRIPE_PUBLISHABLE_KEY', problems, (key) => {
    const match = /^pk_(live|test)_[A-Za-z0-9]{16,}$/.exec(key);
    if (!match) return 'must be a Stripe publishable key (pk_).';
    if ((match[1] === 'live') !== livemode) {
      return `is a ${match[1]} key but PAYMENT_ENVIRONMENT is "${environment}".`;
    }
    return null;
  });
  const webhookSecret = requireSecret(env, 'STRIPE_WEBHOOK_SECRET', problems, (secret) =>
    /^whsec_[A-Za-z0-9+/=_-]{16,}$/.test(secret) ? null : 'must be a Stripe webhook signing secret (whsec_).');
  const paymentPageUrl = value(env, 'STRIPE_PAYMENT_PAGE_URL') ?? '';
  if (!paymentPageUrl) {
    problems.push('STRIPE_PAYMENT_PAGE_URL is required; set it to the web app /checkout/pay page.');
  } else {
    try {
      const url = new URL(paymentPageUrl);
      if (livemode && url.protocol !== 'https:') problems.push('STRIPE_PAYMENT_PAGE_URL must use https in live mode.');
      if (url.protocol !== 'https:' && url.protocol !== 'http:') problems.push('STRIPE_PAYMENT_PAGE_URL must be an http(s) URL.');
      if (url.username || url.password || url.search || url.hash) {
        problems.push('STRIPE_PAYMENT_PAGE_URL must not contain credentials, a query string, or a fragment.');
      }
    } catch {
      problems.push('STRIPE_PAYMENT_PAGE_URL must be an absolute URL.');
    }
  }
  const rawCurrencies = value(env, 'STRIPE_CURRENCIES');
  let currencies: string[] = [];
  if (!rawCurrencies) {
    problems.push('STRIPE_CURRENCIES is required; list only currencies enabled for the Stripe account.');
  } else {
    currencies = parseCurrencyList(rawCurrencies, 'STRIPE_CURRENCIES', problems);
    for (const currency of currencies) {
      if (STRIPE_SPECIAL_CASE.has(currency)) {
        problems.push(`STRIPE_CURRENCIES: ${currency} uses Stripe special-case rounding and is not supported by this gateway.`);
      } else if (currencyFractionDigits(currency) !== stripeCurrencyExponent(currency)) {
        problems.push(`STRIPE_CURRENCIES: ${currency} has different minor units in Stripe and ISO 4217.`);
      }
    }
  }
  return { id: 'stripe', secretKey, publishableKey, webhookSecret, currencies, livemode, paymentPageUrl };
}

function snippeSettings(env: Env, environment: PaymentEnvironment, problems: string[]): SnippeSettings {
  if (environment !== 'live') {
    problems.push('Snippe has no sandbox and every Snippe key moves real money; enable it only when PAYMENT_ENVIRONMENT is "live".');
  }
  const apiKey = requireSecret(env, 'SNIPPE_API_KEY', problems, (key) =>
    /^snp_[A-Za-z0-9_-]{16,}$/.test(key) ? null : 'must be a Snippe API key (snp_).');
  const webhookSecret = requireSecret(env, 'SNIPPE_WEBHOOK_SECRET', problems, (secret) =>
    secret.length >= 32 ? null : 'must be the account webhook signing key from Snippe settings.');
  const rawCurrencies = value(env, 'SNIPPE_CURRENCIES') ?? 'TZS';
  const currencies = parseCurrencyList(rawCurrencies, 'SNIPPE_CURRENCIES', problems);
  if (currencies.some((currency) => currency !== 'TZS')) {
    problems.push('SNIPPE_CURRENCIES may only contain TZS.');
  }
  const profileId = value(env, 'SNIPPE_PROFILE_ID');
  if (profileId && !/^[A-Za-z0-9_-]{4,100}$/.test(profileId)) {
    problems.push('SNIPPE_PROFILE_ID has an invalid format.');
  }
  return { id: 'snippe', apiKey, webhookSecret, currencies, ...(profileId ? { profileId } : {}) };
}

function pesapalSettings(
  env: Env,
  environment: PaymentEnvironment,
  problems: string[],
  currencySetting: 'PESAPAL_CURRENCIES' | 'PAYMENT_SUPPORTED_CURRENCIES',
): PesapalSettings {
  if (!value(env, 'PESAPAL_CONSUMER_KEY') && !value(env, 'PESAPAL_CUSTOMER_KEY')) {
    problems.push('PESAPAL_CONSUMER_KEY is required.');
  }
  if (!value(env, 'PESAPAL_CONSUMER_SECRET') && !value(env, 'PESAPAL_CUSTOMER_SECRET')) {
    problems.push('PESAPAL_CONSUMER_SECRET is required.');
  }
  const pesapalEnv = value(env, 'PESAPAL_ENV') ?? 'sandbox';
  if (pesapalEnv !== 'live' && pesapalEnv !== 'sandbox') {
    problems.push('PESAPAL_ENV must be "live" or "sandbox".');
  } else if ((pesapalEnv === 'live') !== (environment === 'live')) {
    problems.push(`PESAPAL_ENV is "${pesapalEnv}" but PAYMENT_ENVIRONMENT is "${environment}".`);
  }
  const currencies = parseCurrencyList(value(env, currencySetting) ?? 'TZS', currencySetting, problems);
  return { id: 'pesapal', currencies };
}

const PAYPAL_CURRENCIES = new Set([
  'AUD', 'BRL', 'CAD', 'CNY', 'CZK', 'DKK', 'EUR', 'GBP', 'HKD', 'HUF', 'ILS', 'JPY',
  'MXN', 'MYR', 'NOK', 'NZD', 'PHP', 'PLN', 'SEK', 'SGD', 'THB', 'TWD', 'USD',
]);

function paypalSettings(env: Env, environment: PaymentEnvironment, problems: string[]): PayPalSettings {
  const clientId = requireSecret(env, 'PAYPAL_CLIENT_ID', problems, (key) =>
    /^[A-Za-z0-9._-]{8,200}$/.test(key) ? null : 'must be a PayPal REST application client ID.');
  const clientSecret = requireSecret(env, 'PAYPAL_CLIENT_SECRET', problems, (secret) =>
    secret.length >= 8 ? null : 'must be a PayPal REST application secret.');
  const webhookId = requireSecret(env, 'PAYPAL_WEBHOOK_ID', problems, (id) =>
    /^[A-Za-z0-9_-]{8,200}$/.test(id) ? null : 'must be the webhook ID registered for this API URL.');
  const currencies = parseCurrencyList(value(env, 'PAYPAL_CURRENCIES') ?? 'USD', 'PAYPAL_CURRENCIES', problems);
  for (const currency of currencies) {
    if (!PAYPAL_CURRENCIES.has(currency)) {
      problems.push(`PAYPAL_CURRENCIES: ${currency} is not supported by PayPal checkout.`);
    }
  }
  return { id: 'paypal', clientId, clientSecret, webhookId, currencies, environment };
}

export function loadPaymentGatewayConfig(env: Env = process.env): PaymentGatewayConfig {
  const declared = value(env, 'PAYMENT_PROVIDERS');
  const publicApiUrl = value(env, 'PUBLIC_API_URL');

  if (!declared) {
    const hasPesapal = Boolean(
      (value(env, 'PESAPAL_CONSUMER_KEY') || value(env, 'PESAPAL_CUSTOMER_KEY'))
      && (value(env, 'PESAPAL_CONSUMER_SECRET') || value(env, 'PESAPAL_CUSTOMER_SECRET'))
      && publicApiUrl,
    );
    const legacyEnvironment: PaymentEnvironment = value(env, 'PESAPAL_ENV') === 'live' ? 'live' : 'test';
    const problems: string[] = [];
    const providers = hasPesapal
      ? [pesapalSettings(env, legacyEnvironment, problems, 'PAYMENT_SUPPORTED_CURRENCIES')]
      : [];
    if (problems.length) throw new PaymentConfigurationError(problems);
    return { mode: 'legacy', environment: legacyEnvironment, publicApiUrl, providers };
  }

  const problems: string[] = [];
  const rawEnvironment = value(env, 'PAYMENT_ENVIRONMENT');
  if (rawEnvironment !== 'live' && rawEnvironment !== 'test') {
    problems.push('PAYMENT_ENVIRONMENT must be set to "live" or "test" when PAYMENT_PROVIDERS is set.');
  }
  const environment: PaymentEnvironment = rawEnvironment === 'live' ? 'live' : 'test';

  if (!publicApiUrl) {
    problems.push('PUBLIC_API_URL is required for payment returns and webhooks.');
  } else {
    try {
      const url = new URL(publicApiUrl);
      if (environment === 'live' && url.protocol !== 'https:') {
        problems.push('PUBLIC_API_URL must use https when PAYMENT_ENVIRONMENT is "live".');
      }
      if (url.username || url.password || url.search || url.hash) {
        problems.push('PUBLIC_API_URL must not contain credentials, a query string, or a fragment.');
      }
    } catch {
      problems.push('PUBLIC_API_URL must be an absolute URL.');
    }
  }
  if (value(env, 'PAYMENT_SUPPORTED_CURRENCIES')) {
    problems.push('PAYMENT_SUPPORTED_CURRENCIES is replaced by per-provider *_CURRENCIES settings; remove it.');
  }

  const ids = declared.split(',').map((id) => id.trim().toLowerCase()).filter(Boolean);
  if (!ids.length) problems.push('PAYMENT_PROVIDERS must list at least one provider.');
  const seen = new Set<string>();
  const providers: ProviderSettings[] = [];
  for (const id of ids) {
    if (seen.has(id)) {
      problems.push(`PAYMENT_PROVIDERS lists ${id} more than once.`);
      continue;
    }
    seen.add(id);
    if (id === 'stripe') providers.push(stripeSettings(env, environment, problems));
    else if (id === 'snippe') providers.push(snippeSettings(env, environment, problems));
    else if (id === 'pesapal') providers.push(pesapalSettings(env, environment, problems, 'PESAPAL_CURRENCIES'));
    else if (id === 'paypal') providers.push(paypalSettings(env, environment, problems));
    else problems.push(`PAYMENT_PROVIDERS contains unknown provider "${id}". Use: ${PAYMENT_PROVIDER_IDS.join(', ')}.`);
  }

  if (problems.length) throw new PaymentConfigurationError(problems);
  return { mode: 'explicit', environment, publicApiUrl, providers };
}
