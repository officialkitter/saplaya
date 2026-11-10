export type PaymentNavigation = 'checkout' | 'callback' | 'blocked';

export function classifyPaymentNavigation(rawUrl: string, apiUrl: string): PaymentNavigation {
  let url: URL;
  let callback: URL;
  try {
    url = new URL(rawUrl);
    callback = new URL(`${apiUrl.replace(/\/+$/, '')}/payments/callback`);
  } catch {
    return 'blocked';
  }
  if (url.username || url.password) return 'blocked';
  if (url.protocol === 'saplaya:' && url.hostname === 'payment-callback'
    && !url.port && (url.pathname === '' || url.pathname === '/')) return 'callback';
  if (url.protocol === 'https:' && url.origin === callback.origin
    && url.pathname === callback.pathname) return 'callback';
  return url.protocol === 'https:' ? 'checkout' : 'blocked';
}
