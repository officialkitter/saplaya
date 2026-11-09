'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStorefrontCart } from '@/lib/cart';
import { useGlobalMarket } from '@/lib/global-market';
import { storefrontRequest } from '@/lib/storefront-auth';
import { volumePrice, volumeTheme, volumeTier } from '@/lib/volume';

type DeliveryEta = 'morning' | 'evening' | '12h' | '24h' | '48h' | '72h' | '7d' | '10d' | '14d';
type DeliveryOption = { value: DeliveryEta; title: string; fee: number };

type CheckoutQuote = {
  items: { requested_product_id: string; product_id: string; qty: number; unit_price: number; distance_km: number }[];
  subtotal: number;
  distance_km: number;
  delivery_fee: number;
  amount: number;
};
type CheckoutOptions = { cash_on_delivery: boolean; online_payment: boolean };
type PaymentSession = { payment_url: string };
type OrderResult = { order_id: string; amount: number };

function formatTZS(amount: number) {
  return new Intl.NumberFormat('en-TZ', { style: 'currency', currency: 'TZS', maximumFractionDigits: 0 }).format(amount);
}

export default function CheckoutPage() {
  const { lines, setQuantity, clear, mode, preferredMode, setPreferredMode } = useStorefrontCart();
  const market = useGlobalMarket();
  const [deliveryOptions, setDeliveryOptions] = useState<DeliveryOption[]>([]);
  const [options, setOptions] = useState<CheckoutOptions | null>(null);
  const [deliveryWindow, setDeliveryWindow] = useState<DeliveryEta>('morning');
  const [paymentMethod, setPaymentMethod] = useState<'cash_on_delivery' | 'online'>('cash_on_delivery');
  const [quote, setQuote] = useState<CheckoutQuote | null>(null);
  const [quoteError, setQuoteError] = useState('');
  const [contact, setContact] = useState({ name: '', email: '', phone: '' });
  const [acceptedFee, setAcceptedFee] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [orderId, setOrderId] = useState('');
  const [setupError, setSetupError] = useState('');
  const cashRequestKey = useRef<string | null>(null);

  const isDailyDelivery = mode === 'retail' || mode === 'wholesale';
  const availableDeliveryOptions = useMemo(() => deliveryOptions.filter((option) =>
    isDailyDelivery ? option.value === 'morning' || option.value === 'evening'
      : option.value !== 'morning' && option.value !== 'evening',
  ), [deliveryOptions, isDailyDelivery]);
  const theme = volumeTheme(mode);
  const items = useMemo(() => lines.map(({ product, qty }) => ({ product_id: product.id, qty })), [lines]);
  const quoteKey = JSON.stringify({
    mode, deliveryWindow, items, lat: market.location?.lat, lng: market.location?.lng,
  });

  useEffect(() => {
    let active = true;
    Promise.all([
      storefrontRequest<DeliveryOption[]>('/delivery-options'),
      storefrontRequest<CheckoutOptions>('/checkout/options'),
    ]).then(([delivery, checkout]) => {
      if (!active) return;
      setDeliveryOptions(delivery);
      setOptions(checkout);
    }).catch((cause: unknown) => {
      if (!active) return;
      setSetupError(cause instanceof Error ? cause.message : 'Checkout options are unavailable.');
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (availableDeliveryOptions.some((option) => option.value === deliveryWindow)) return;
    setDeliveryWindow(isDailyDelivery ? 'morning' : '24h');
  }, [availableDeliveryOptions, deliveryWindow, isDailyDelivery]);

  useEffect(() => {
    let active = true;
    setQuote(null);
    setQuoteError('');
    setAcceptedFee(false);
    if (!items.length || !market.location || !availableDeliveryOptions.some((option) => option.value === deliveryWindow)) return;
    void storefrontRequest<CheckoutQuote>('/checkout/quote', {
      mode,
      delivery_window: deliveryWindow,
      items,
      lat: market.location.lat,
      lng: market.location.lng,
    }).then((result) => {
      if (active) setQuote(result);
    }).catch((cause: unknown) => {
      if (active) setQuoteError(cause instanceof Error ? cause.message : 'Could not prepare your delivery quote.');
    });
    return () => { active = false; };
  }, [quoteKey, availableDeliveryOptions, items, market.location, mode, deliveryWindow]);

  useEffect(() => {
    cashRequestKey.current = null;
  }, [quoteKey, contact.name, contact.email, contact.phone, acceptedFee]);

  const submit = useCallback(async () => {
    setError('');
    if (!lines.length) return setError('Add at least one product before checkout.');
    if (!market.location) return setError('Allow precise location access to calculate farm availability and delivery.');
    if (!quote) return setError(quoteError || 'Wait for the latest delivery quote before placing your order.');
    if (!contact.name.trim() || !contact.phone.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email.trim())) {
      return setError('Enter your name, a valid email address and a reachable phone number.');
    }
    if (quote.delivery_fee > 0 && !acceptedFee) return setError('Accept the quoted delivery charge to continue.');
    if (paymentMethod === 'online' && !options?.online_payment) return setError('Online payment is not available for web checkout yet.');

    setBusy(true);
    try {
      const input = {
        client_platform: 'web' as const,
        mode,
        delivery_window: deliveryWindow,
        delivery_fee_accepted: acceptedFee,
        quoted_delivery_fee: quote.delivery_fee,
        items,
        lat: market.location.lat,
        lng: market.location.lng,
        customer: { name: contact.name.trim(), email: contact.email.trim(), phone: contact.phone.trim() },
      };
      if (paymentMethod === 'online') {
        const payment = await storefrontRequest<PaymentSession>('/payments/initialize', input);
        window.location.assign(payment.payment_url);
        return;
      }
      const order = await storefrontRequest<OrderResult>('/orders/cash', {
        ...input,
        request_key: cashRequestKey.current ?? (cashRequestKey.current = crypto.randomUUID()),
      });
      setOrderId(order.order_id);
      clear();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not place your order.');
    } finally {
      setBusy(false);
    }
  }, [lines, market.location, quote, quoteError, contact, acceptedFee, paymentMethod, options, mode, deliveryWindow, items, clear]);

  if (orderId) {
    return (
      <main className="mx-auto max-w-2xl px-5 py-20">
        <section className="rounded-3xl border border-line bg-white p-8 text-center shadow-soft">
          <p className="text-sm font-extrabold uppercase tracking-wide text-leaf-deep">Order received</p>
          <h1 className="mt-3 font-display text-3xl font-extrabold">Thank you for ordering with Saplaya.</h1>
          <p className="mt-3 text-ink-soft">Your order reference is <strong className="break-all text-ink">{orderId}</strong>.</p>
          <p className="mt-2 text-sm text-ink-mute">The delivery team will contact you using the details provided.</p>
          <Link className="mt-6 inline-flex rounded-xl bg-leaf px-5 py-3 font-bold text-white" href="/orders">View order status</Link>
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto grid max-w-6xl gap-8 px-5 py-10 lg:grid-cols-[1fr_360px]">
      <section style={{ backgroundColor: theme.background }} className="rounded-3xl p-4 sm:p-6">
        <Link href="/" className="text-sm font-bold text-leaf-deep underline">Continue browsing</Link>
        <h1 className="mt-4 font-display text-3xl font-extrabold" style={{ color: theme.accent }}>{theme.label} basket</h1>
        <p role="status" className="mt-2 inline-flex rounded-full px-3 py-1 text-sm font-bold" style={{ color: theme.accent, backgroundColor: theme.soft }}>
          {theme.label}
        </p>
        {!lines.length ? (
          <div className="mt-6 rounded-3xl border border-line bg-white p-8 text-center">
            <p className="font-bold">Your basket is empty.</p>
            <Link href="/#fresh" className="mt-3 inline-block font-bold text-leaf-deep underline">Browse products</Link>
          </div>
        ) : (
          <ul className="mt-6 space-y-3">
            {lines.map(({ product, qty }) => (
              <li key={product.id} className="flex flex-col gap-3 rounded-2xl border border-line bg-white p-4 sm:flex-row sm:items-center sm:gap-4">
                <div className="min-w-0 flex-1">
                  <h2 className="break-words font-bold">{product.name}</h2>
                  <p className="text-sm text-ink-mute">{product.category} · {formatTZS(volumePrice(product, qty, preferredMode) ?? product.retail_price)} per {product.unit}</p>
                  <p className="mt-1 text-xs font-extrabold" style={{ color: theme.accent }}>
                    {volumeTier(product, qty, preferredMode).replace('_', '-')} pricing
                  </p>
                  {quote?.items.find((item) => item.requested_product_id === product.id) && (
                    <p className="mt-1 text-sm font-bold text-leaf-deep">
                      Quoted {formatTZS(quote.items.find((item) => item.requested_product_id === product.id)!.unit_price)} per {product.unit}
                    </p>
                  )}
                </div>
                <div className="flex items-center justify-between gap-4 sm:justify-start">
                  <label className="sr-only" htmlFor={`quantity-${product.id}`}>Quantity for {product.name}</label>
                  <input
                    id={`quantity-${product.id}`}
                    type="number"
                    min="0.01"
                    step="any"
                    max={Math.min(10000, product.stock)}
                    value={qty}
                    onChange={(event) => setQuantity(product.id, Number(event.target.value))}
                    className="w-24 rounded-xl border border-line px-3 py-2 text-center font-bold"
                  />
                  <button type="button" onClick={() => setQuantity(product.id, 0)} className="text-sm font-bold text-red-700 underline">Remove</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <aside className="h-fit rounded-3xl border border-line bg-white p-5 shadow-soft" style={{ borderColor: `${theme.accent}66` }}>
        <h2 className="font-display text-xl font-extrabold" style={{ color: theme.accent }}>Delivery and payment</h2>
        {setupError && <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-800">{setupError}</p>}
        <div className="mt-4 space-y-3">
          <button type="button" onClick={market.requestLocation} className="w-full rounded-xl border border-leaf px-4 py-3 text-left font-bold text-leaf-deep">
            {market.location ? `Precise location ready (${market.location.accuracy.toFixed(0)} m accuracy)` : 'Use my current location'}
          </button>
          {market.locationError && <p role="status" className="text-sm text-red-700">{market.locationError}</p>}
          {market.location && <p className="text-xs text-ink-mute">Coordinates are used to match farms and calculate delivery. They are not shown in the public shop.</p>}

          <label className="block text-sm font-bold">Order type
            <select value={preferredMode} onChange={(event) => setPreferredMode(event.target.value as 'retail' | 'wholesale')} className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2.5">
              <option value="retail">Retail</option>
              <option value="wholesale">Wholesale</option>
            </select>
          </label>
          <label className="block text-sm font-bold">Delivery time
            <select value={deliveryWindow} onChange={(event) => setDeliveryWindow(event.target.value as DeliveryEta)} className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2.5">
              {availableDeliveryOptions.map((option) => {
                const title = option.value === 'morning' ? 'Morning (07:00–10:00)'
                  : option.value === 'evening' ? 'Evening (15:00–18:00)'
                    : option.title.replace(/\s+delivery window$/i, '');
                return <option key={option.value} value={option.value}>{title} · {formatTZS(option.fee)}</option>;
              })}
            </select>
          </label>
          {isDailyDelivery && <p className="text-xs text-ink-mute">Delivery windows are shown in local time.</p>}

          {(['name', 'email', 'phone'] as const).map((field) => (
            <label key={field} className="block text-sm font-bold capitalize">{field === 'phone' ? 'Phone number' : field}
              <input
                type={field === 'email' ? 'email' : 'text'}
                autoComplete={field === 'name' ? 'name' : field === 'email' ? 'email' : 'tel'}
                value={contact[field]}
                onChange={(event) => setContact((current) => ({ ...current, [field]: event.target.value }))}
                className="mt-1 w-full rounded-xl border border-line px-3 py-2.5 font-normal"
              />
            </label>
          ))}

          {options?.online_payment && (
            <label className="flex items-center gap-3 rounded-xl border border-line p-3 text-sm font-bold">
              <input type="radio" name="payment" checked={paymentMethod === 'online'} onChange={() => setPaymentMethod('online')} />
              Pay online securely
            </label>
          )}
          {options?.cash_on_delivery && (
            <label className="flex items-center gap-3 rounded-xl border border-line p-3 text-sm font-bold">
              <input type="radio" name="payment" checked={paymentMethod === 'cash_on_delivery'} onChange={() => setPaymentMethod('cash_on_delivery')} />
              Payment on delivery
            </label>
          )}

          {quoteError && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{quoteError}</p>}
          {quote && (
            <div className="space-y-2 border-t border-line pt-3 text-sm">
              <p className="flex justify-between"><span>Items (server quote)</span><strong>{formatTZS(quote.subtotal)}</strong></p>
              <p className="flex justify-between"><span>Delivery</span><strong>{formatTZS(quote.delivery_fee)}</strong></p>
              <p className="flex justify-between text-base"><span>Total</span><strong>{formatTZS(quote.amount)}</strong></p>
              {quote.delivery_fee > 0 && (
                <label className="flex items-start gap-2 pt-1">
                  <input type="checkbox" checked={acceptedFee} onChange={(event) => setAcceptedFee(event.target.checked)} />
                  <span>I accept the quoted delivery charge.</span>
                </label>
              )}
            </div>
          )}
          {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
          <button type="button" onClick={() => { void submit(); }} disabled={busy || lines.length === 0} style={{ backgroundColor: theme.button, color: theme.buttonText }} className="w-full rounded-xl px-4 py-3 font-extrabold disabled:cursor-not-allowed disabled:opacity-50">
            {busy ? 'Placing order…' : paymentMethod === 'online' ? 'Continue to secure payment' : 'Place order'}
          </button>
        </div>
      </aside>
    </main>
  );
}
