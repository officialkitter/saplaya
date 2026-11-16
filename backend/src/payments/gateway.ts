import { paymentAmountsMatch } from '../currency.js';
import type { PaymentGatewayConfig, PaymentProviderId } from './config.js';
import {
  PaymentProviderError,
  PesapalProvider,
  SnippeProvider,
  StripeProvider,
  type PaymentProvider,
  type VerifiedPayment,
} from './providers.js';

export type ProviderReadiness = {
  id: PaymentProviderId;
  label: string;
  methods: string[];
  currencies: string[];
  ready: boolean;
  reason?: string;
};

export class PaymentGateway {
  readonly providers: PaymentProvider[];

  constructor(
    readonly config: PaymentGatewayConfig,
    options: { loadPesapalIpnId: () => Promise<string | null>; fetchImpl?: typeof fetch },
    providers?: PaymentProvider[],
  ) {
    this.providers = providers ?? config.providers.map((settings) => {
      if (settings.id === 'stripe') return new StripeProvider(settings, options.fetchImpl);
      if (settings.id === 'snippe') return new SnippeProvider(settings, options.fetchImpl);
      return new PesapalProvider(settings, options.loadPesapalIpnId);
    });
    this.loadPesapalIpnId = options.loadPesapalIpnId;
  }

  private readonly loadPesapalIpnId: () => Promise<string | null>;

  get(id: PaymentProviderId): PaymentProvider | undefined {
    return this.providers.find((provider) => provider.id === id);
  }

  async readiness(): Promise<ProviderReadiness[]> {
    return Promise.all(this.providers.map(async (provider) => {
      const base = { id: provider.id, label: provider.label, methods: provider.methods, currencies: provider.currencies };
      if (provider.id !== 'pesapal') return { ...base, ready: true };
      const ipnId = await this.loadPesapalIpnId();
      return ipnId ? { ...base, ready: true } : { ...base, ready: false, reason: 'Pesapal IPN is not registered.' };
    }));
  }

  async readyProviders(): Promise<PaymentProvider[]> {
    const readiness = await this.readiness();
    return this.providers.filter((provider) => readiness.find((item) => item.id === provider.id)?.ready);
  }

  // Providers are ordered by priority, so the first ready provider for the currency wins unless one is requested.
  async select(currency: string, preferred?: PaymentProviderId): Promise<PaymentProvider | { error: string; status: 400 | 503 }> {
    const ready = await this.readyProviders();
    if (preferred) {
      const provider = ready.find((candidate) => candidate.id === preferred);
      if (!provider) return { error: 'The selected payment provider is not available.', status: 400 };
      if (!provider.currencies.includes(currency)) {
        return { error: `${provider.label} does not accept ${currency}.`, status: 400 };
      }
      return provider;
    }
    const provider = ready.find((candidate) => candidate.currencies.includes(currency));
    if (provider) return provider;
    if (!ready.length) return { error: 'Online payment is not configured on the server.', status: 503 };
    return { error: `Online payments in ${currency} are not supported by this merchant.`, status: 400 };
  }
}

export type StoredPayment = {
  transaction_ref: string;
  provider: PaymentProviderId;
  gateway_transaction_id: string | null;
  payment_amount: number | string;
  currency: string;
  status: 'pending' | 'paid' | 'failed' | string;
  order_id: string | null;
};

export interface SettlementStore {
  markFailed(transactionRef: string): Promise<void>;
  complete(transactionRef: string, provider: PaymentProviderId, gatewayId: string): Promise<string>;
}

export type SettlementResult =
  | { outcome: 'paid'; orderId: string }
  | { outcome: 'pending' }
  | { outcome: 'failed' }
  | { outcome: 'mismatch'; reason: string };

export function checkVerifiedPayment(payment: StoredPayment, verified: VerifiedPayment): string | null {
  if (!payment.gateway_transaction_id || verified.gatewayId !== payment.gateway_transaction_id) {
    return 'Provider transaction ID does not match the checkout.';
  }
  if (verified.reference && verified.reference !== payment.transaction_ref) {
    return 'Provider reference does not match the checkout.';
  }
  if (verified.state === 'paid') {
    if (verified.currency !== payment.currency.toUpperCase()) return 'Paid currency does not match the checkout.';
    if (!paymentAmountsMatch(verified.amount, payment.payment_amount, payment.currency)) {
      return 'Paid amount does not match the checkout.';
    }
  }
  return null;
}

// Every confirmation path (customer return, webhook, IPN) goes through this provider re-verification.
export async function settlePayment(
  gateway: PaymentGateway,
  store: SettlementStore,
  payment: StoredPayment,
): Promise<SettlementResult> {
  if (payment.status === 'paid' && payment.order_id) return { outcome: 'paid', orderId: payment.order_id };
  const provider = gateway.get(payment.provider);
  if (!provider) throw new PaymentProviderError(`Payment provider ${payment.provider} is not configured.`, 503);
  if (!payment.gateway_transaction_id) return { outcome: 'pending' };
  const verified = await provider.verify(payment.gateway_transaction_id);
  const mismatch = checkVerifiedPayment(payment, verified);
  if (mismatch) return { outcome: 'mismatch', reason: mismatch };
  if (verified.state === 'pending') return { outcome: 'pending' };
  if (verified.state === 'failed') {
    if (payment.status === 'pending') await store.markFailed(payment.transaction_ref);
    return { outcome: 'failed' };
  }
  const orderId = await store.complete(payment.transaction_ref, payment.provider, payment.gateway_transaction_id);
  return { outcome: 'paid', orderId };
}
