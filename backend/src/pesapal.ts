type PesapalError = {
  type: string;
  code: string;
  message: string;
};

type PesapalResponse = Record<string, unknown> & {
  error?: PesapalError | null;
};

const environments = {
  sandbox: 'https://cybqa.pesapal.com/pesapalv3',
  live: 'https://pay.pesapal.com/v3',
} as const;

const environment = process.env.PESAPAL_ENV ?? 'sandbox';
if (!(environment in environments)) {
  throw new Error('PESAPAL_ENV must be either "sandbox" or "live".');
}

const baseUrl = environments[environment as keyof typeof environments];
let cachedToken: { value: string; expiresAt: number } | undefined;
let tokenRequest: Promise<string> | undefined;

export class PesapalApiError extends Error {
  constructor(message: string, readonly details?: PesapalError) {
    super(message);
    this.name = 'PesapalApiError';
  }
}

function isJsonObject(value: unknown): value is PesapalResponse {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function standardError(body: PesapalResponse): PesapalError | undefined {
  const error = body.error;
  if (
    error
    && typeof error.type === 'string'
    && typeof error.code === 'string'
    && typeof error.message === 'string'
  ) {
    return error;
  }
  return undefined;
}

async function request<T extends PesapalResponse>(
  path: string,
  token: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    signal: AbortSignal.timeout(15_000),
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
  });

  let parsed: unknown;
  try {
    parsed = await response.json();
  } catch {
    throw new PesapalApiError(`Pesapal returned a non-JSON response (${response.status}).`);
  }
  if (!isJsonObject(parsed)) {
    throw new PesapalApiError(`Pesapal returned an invalid JSON response (${response.status}).`);
  }
  const body = parsed as T;
  const apiError = standardError(body);
  if (apiError) {
    throw new PesapalApiError(apiError.message, apiError);
  }
  if (!response.ok) {
    throw new PesapalApiError(`Pesapal request failed with HTTP ${response.status}.`);
  }
  return body;
}

export async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) {
    return cachedToken.value;
  }
  if (tokenRequest) return tokenRequest;

  tokenRequest = (async () => {
    const consumerKey = process.env.PESAPAL_CONSUMER_KEY ?? process.env.PESAPAL_CUSTOMER_KEY;
    const consumerSecret = process.env.PESAPAL_CONSUMER_SECRET ?? process.env.PESAPAL_CUSTOMER_SECRET;
    if (!consumerKey || !consumerSecret) {
      throw new Error('Pesapal credentials are not configured on the server.');
    }

    const response = await fetch(`${baseUrl}/api/Auth/RequestToken`, {
      method: 'POST',
      signal: AbortSignal.timeout(15_000),
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        consumer_key: consumerKey,
        consumer_secret: consumerSecret,
      }),
    });

    let parsed: unknown;
    try {
      parsed = await response.json();
    } catch {
      throw new PesapalApiError(`Pesapal authentication returned a non-JSON response (${response.status}).`);
    }
    if (!isJsonObject(parsed)) {
      throw new PesapalApiError(`Pesapal authentication returned an invalid JSON response (${response.status}).`);
    }
    const body = parsed;
    const apiError = standardError(body);
    if (apiError) {
      throw new PesapalApiError(apiError.message, apiError);
    }
    if (!response.ok) {
      throw new PesapalApiError(`Pesapal authentication failed with HTTP ${response.status}.`);
    }
    if (typeof body.token !== 'string' || !body.token.trim()) {
      throw new PesapalApiError('Pesapal authentication response did not contain a token.');
    }

    const expiryDate = typeof body.expiryDate === 'string' ? Date.parse(body.expiryDate) : NaN;
    const expiresIn = typeof body.expires_in === 'number' ? body.expires_in * 1000 : NaN;
    const expiresAt = Number.isFinite(expiryDate)
      ? expiryDate
      : Number.isFinite(expiresIn) ? Date.now() + expiresIn : Date.now() + 4 * 60_000;
    cachedToken = { value: body.token, expiresAt };
    return body.token;
  })();

  try {
    return await tokenRequest;
  } finally {
    tokenRequest = undefined;
  }
}

export async function registerIpn(url: string): Promise<string> {
  const token = await getAccessToken();
  const response = await request<PesapalResponse>('/api/URLSetup/RegisterIPN', token, {
    method: 'POST',
    body: JSON.stringify({ url, ipn_notification_type: 'GET' }),
  });
  if (typeof response.ipn_id !== 'string' || !response.ipn_id.trim()) {
    throw new PesapalApiError('Pesapal IPN registration response did not contain an ipn_id.');
  }
  return response.ipn_id;
}

export type PesapalOrder = {
  order_tracking_id: string;
  merchant_reference: string;
  redirect_url: string;
};

export async function submitOrder(order: {
  reference: string;
  amount: number;
  callbackUrl: string;
  ipnId: string;
  email: string;
  phone: string;
  name: string;
}): Promise<PesapalOrder> {
  const token = await getAccessToken();
  const names = order.name.trim().split(/\s+/);
  const response = await request<PesapalResponse>('/api/Transactions/SubmitOrderRequest', token, {
    method: 'POST',
    body: JSON.stringify({
      id: order.reference,
      currency: 'TZS',
      amount: order.amount,
      description: 'Saplaya groceries checkout',
      callback_url: order.callbackUrl,
      notification_id: order.ipnId,
      billing_address: {
        email_address: order.email,
        phone_number: order.phone,
        country_code: 'TZ',
        first_name: names[0],
        middle_name: '',
        last_name: names.slice(1).join(' ') || names[0],
        line_1: '',
        line_2: '',
        city: '',
        state: '',
        postal_code: '',
        zip_code: '',
      },
    }),
  });

  if (
    typeof response.order_tracking_id !== 'string'
    || !response.order_tracking_id.trim()
    || response.merchant_reference !== order.reference
    || typeof response.redirect_url !== 'string'
  ) {
    throw new PesapalApiError('Pesapal order response did not contain valid tracking and redirect details.');
  }
  let redirectUrl: URL;
  try {
    redirectUrl = new URL(response.redirect_url);
  } catch {
    throw new PesapalApiError('Pesapal returned an invalid checkout URL.');
  }
  if (redirectUrl.origin !== new URL(baseUrl).origin) {
    throw new PesapalApiError('Pesapal returned a checkout URL outside its configured environment.');
  }
  return {
    order_tracking_id: response.order_tracking_id,
    merchant_reference: response.merchant_reference,
    redirect_url: response.redirect_url,
  };
}

export type PesapalTransactionStatus = {
  order_tracking_id?: string;
  merchant_reference?: string;
  payment_status_description?: string;
  payment_status_code?: string | number;
  status_code?: string | number;
  status?: string | number;
  amount?: string | number;
  currency?: string;
};

export async function getTransactionStatus(orderTrackingId: string): Promise<PesapalTransactionStatus> {
  const token = await getAccessToken();
  const response = await request<PesapalResponse>(
    `/api/Transactions/GetTransactionStatus?orderTrackingId=${encodeURIComponent(orderTrackingId)}`,
    token,
  );
  return response as PesapalTransactionStatus;
}

export function isPaymentCompleted(status: PesapalTransactionStatus): boolean {
  const description = status.payment_status_description?.trim().toUpperCase();
  const paymentStatus = typeof status.status === 'string' ? status.status.trim().toUpperCase() : '';
  const code = String(status.status_code ?? status.payment_status_code ?? '');

  if (description) return description === 'COMPLETED';
  if (code) return code === '1';
  return paymentStatus === 'COMPLETED';
}

export function isPaymentFailed(status: PesapalTransactionStatus): boolean {
  const description = status.payment_status_description?.trim().toUpperCase();
  const paymentStatus = typeof status.status === 'string' ? status.status.trim().toUpperCase() : '';
  const code = String(status.status_code ?? status.payment_status_code ?? '');
  return ['FAILED', 'CANCELLED', 'REVERSED'].includes(description ?? '')
    || ['FAILED', 'CANCELLED', 'REVERSED'].includes(paymentStatus)
    || ['2', '3'].includes(code);
}
