'use client';

import { userFacingMessage } from '@/lib/user-facing-error';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStorefrontCart } from '@/lib/cart';
import { useGlobalMarket } from '@/lib/global-market';
import { StorefrontRequestError, storefrontRequest } from '@/lib/storefront-auth';
import { orderMode, volumePrice, volumeTheme, volumeTier } from '@/lib/volume';
import { DeliveryAddressSearch } from '@/components/DeliveryAddressSearch';
import { availableDailyDeliveryWindows, dailyDeliveryDay } from '@/lib/delivery-time';
import { CountryCodePicker } from '@/components/CountryCodePicker';
import { SmartImage } from '@/components/ui/SmartImage';
import { CreditCard, Smartphone, Wallet } from 'lucide-react';

type DeliveryEta = 'morning' | 'evening' | '12h' | '24h' | '48h' | '72h' | '7d' | '10d' | '14d';
type DeliveryOption = { value: DeliveryEta; title: string; fee: number };

type CheckoutQuote = {
  items: { requested_product_id: string; product_id: string; qty: number; unit_price: number; distance_km: number }[];
  subtotal: number;
  distance_km: number;
  delivery_fee: number;
  amount: number;
  payment_currency: string;
  payment_amount: number;
  exchange_rate: number;
};
type PaymentProviderOption = {
  id: 'stripe' | 'snippe' | 'pesapal' | 'paypal';
  label: string;
  channels?: PaymentChannel[];
  methods: string[];
  currencies: string[];
  requires_phone: boolean;
};
type PaymentChannel = 'mobile_money' | 'cards' | 'other';
const paymentChannels: { id: PaymentChannel; label: string; icon: typeof CreditCard }[] = [
  { id: 'mobile_money', label: 'Mobile money', icon: Smartphone },
  { id: 'cards', label: 'Cards & wallets', icon: CreditCard },
  { id: 'other', label: 'Other methods', icon: Wallet },
];

function providerSupportsChannel(provider: PaymentProviderOption, channel: PaymentChannel): boolean {
  if (provider.channels) return provider.channels.includes(channel);
  if (channel === 'mobile_money') return provider.requires_phone;
  if (channel === 'cards') return provider.id !== 'snippe';
  return provider.id === 'stripe' || provider.id === 'paypal';
}

type CheckoutOptions = {
  cash_on_delivery: boolean;
  online_payment: boolean;
  payment_currencies: string[];
  cash_currency: string;
  payment_providers?: PaymentProviderOption[];
};
type PaymentSession = { payment_url: string; tx_ref?: string; order_tracking_id?: string };
type OrderResult = { order_id: string; amount: number };

export default function CheckoutPage() {
  const { lines, setQuantity, clear, mode, preferredMode, setPreferredMode } = useStorefrontCart();
  const market = useGlobalMarket();
  const formatTZS = market.formatPrice;
  const [deliveryOptions, setDeliveryOptions] = useState<DeliveryOption[]>([]);
  const [options, setOptions] = useState<CheckoutOptions | null>(null);
  const [deliveryWindow, setDeliveryWindow] = useState<DeliveryEta>('morning');
  const [paymentMethod, setPaymentMethod] = useState<'cash_on_delivery' | 'online'>('cash_on_delivery');
  const [quotedBasket, setQuotedBasket] = useState<{ key: string; quote: CheckoutQuote } | null>(null);
  const [quoteRefreshVersion, setQuoteRefreshVersion] = useState(0);
  const [quoteError, setQuoteError] = useState('');
  const [contact, setContact] = useState({ name: '', email: '', phone: '' });
  const [phoneDial, setPhoneDial] = useState('+255');
  const [forSomeoneElse, setForSomeoneElse] = useState(false);
  const [recipient, setRecipient] = useState({ name: '', phone: '' });
  const [recipientDial, setRecipientDial] = useState('+255');
  const [paymentPhone, setPaymentPhone] = useState('');
  const [paymentPhoneDial, setPaymentPhoneDial] = useState('+255');
  const [preferredProvider, setPreferredProvider] = useState<PaymentProviderOption['id'] | ''>('');
  const [paymentChannel, setPaymentChannel] = useState<PaymentChannel>('mobile_money');
  const [acceptedFee, setAcceptedFee] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [orderId, setOrderId] = useState('');
  const [setupError, setSetupError] = useState('');
  const cashRequestKey = useRef<string | null>(null);

  const isDailyDelivery = mode === 'retail' || mode === 'wholesale';
  const effectiveMode = orderMode(lines, preferredMode);
  const [deliveryClock, setDeliveryClock] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setDeliveryClock(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const dailyWindows = useMemo(() => availableDailyDeliveryWindows(deliveryClock), [deliveryClock]);
  const availableDeliveryOptions = useMemo(() => deliveryOptions.filter((option) =>
    isDailyDelivery ? dailyWindows.includes(option.value as 'morning' | 'evening')
      : option.value !== 'morning' && option.value !== 'evening',
  ), [deliveryOptions, isDailyDelivery, dailyWindows]);
  const theme = volumeTheme(mode);
  const currencyProviders = useMemo(
    () => (options?.payment_providers ?? []).filter((provider) => provider.currencies.includes(market.currency)),
    [options, market.currency],
  );
  const availablePaymentChannels = paymentChannels.filter((channel) =>
    currencyProviders.some((provider) => providerSupportsChannel(provider, channel.id)),
  );
  const selectedChannel = availablePaymentChannels.find((channel) => channel.id === paymentChannel)
    ?? availablePaymentChannels[0];
  const channelProviders = selectedChannel
    ? currencyProviders.filter((provider) => providerSupportsChannel(provider, selectedChannel.id))
    : [];
  const selectedProvider = channelProviders.find((provider) => provider.id === preferredProvider) ?? channelProviders[0];
  // Older API responses omit payment_providers; those deployments are Pesapal-only and need a phone.
  const providerNeedsPhone = selectedProvider ? selectedProvider.requires_phone : true;
  const items = useMemo(() => lines.map(({ product, qty }) => ({ product_id: product.id, qty })), [lines]);
  const quoteKey = JSON.stringify({
    mode: effectiveMode, deliveryWindow, items, lat: market.location?.lat, lng: market.location?.lng,
    currency: paymentMethod === 'online' ? market.currency : 'TZS',
  });
  const currentQuoteKey = useRef(quoteKey);
  currentQuoteKey.current = quoteKey;
  const quote = quotedBasket?.key === quoteKey ? quotedBasket.quote : null;

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
      setSetupError(userFacingMessage(cause, 'Checkout options are unavailable.'));
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (availableDeliveryOptions.some((option) => option.value === deliveryWindow)) return;
    setDeliveryWindow(isDailyDelivery ? 'morning' : '24h');
  }, [availableDeliveryOptions, deliveryWindow, isDailyDelivery]);

  useEffect(() => {
    let active = true;
    setQuotedBasket(null);
    setQuoteError('');
    setAcceptedFee(false);
    if (!items.length || !availableDeliveryOptions.some((option) => option.value === deliveryWindow)) return;
    void storefrontRequest<CheckoutQuote>('/checkout/quote', {
      mode: effectiveMode,
      delivery_window: deliveryWindow,
      items,
      ...(market.location ? { lat: market.location.lat, lng: market.location.lng } : {}),
      currency: paymentMethod === 'online' ? market.currency : 'TZS',
    }).then((result) => {
      if (active) setQuotedBasket({ key: quoteKey, quote: result });
    }).catch((cause: unknown) => {
      if (active) setQuoteError(userFacingMessage(cause, 'Could not prepare your delivery quote.'));
    });
    return () => { active = false; };
  }, [quoteKey, quoteRefreshVersion, availableDeliveryOptions, items, market.location, market.currency, paymentMethod, mode, deliveryWindow]);

  useEffect(() => {
    cashRequestKey.current = null;
  }, [quoteKey, contact.name, contact.email, contact.phone, acceptedFee, forSomeoneElse, recipient.name, recipient.phone, market.placeName]);

  const submit = useCallback(async () => {
    setError('');
    if (!lines.length) return setError('Add at least one product before checkout.');
    if (!quote) return setError(quoteError || 'Wait for the latest delivery quote before placing your order.');
    if (!quote) return setError(quoteError || 'Wait for the latest delivery quote before placing your order.');
    const phone = `${phoneDial}${contact.phone.replace(/[^0-9]/g, '').replace(/^0/, '')}`;
    const recipientPhone = `${recipientDial}${recipient.phone.replace(/[^0-9]/g, '').replace(/^0/, '')}`;
    if (!contact.name.trim() || !contact.phone.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email.trim())) {
      return setError('Enter your name, a valid email address and a reachable phone number.');
    }
    if (quote.delivery_fee > 0 && !acceptedFee) return setError('Accept the quoted delivery charge to continue.');
    if (forSomeoneElse && (!recipient.name.trim() || !/^\+[1-9]\d{7,14}$/.test(recipientPhone))) {
      return setError('Enter the recipient’s name and phone number.');
    }
    if (paymentMethod === 'online' && !options?.online_payment) return setError('Online payment is not available for web checkout yet.');
    if (paymentMethod === 'online' && !options?.payment_currencies.includes(market.currency)) {
      return setError(`Online payment in ${market.currency} is not supported by this merchant. Choose a supported currency or pay on delivery in ${options?.cash_currency || 'TZS'}.`);
    }

    setBusy(true);
    try {
      const input = {
        client_platform: 'web' as const,
        mode: effectiveMode,
        delivery_window: deliveryWindow,
        delivery_fee_accepted: acceptedFee,
        quoted_delivery_fee: quote.delivery_fee,
        quoted_subtotal: quote.subtotal,
        items: quote.items.map((item) => ({ product_id: item.product_id, qty: item.qty })),
        ...(market.location ? { lat: market.location.lat, lng: market.location.lng } : {}),
        customer: { name: contact.name.trim(), email: contact.email.trim(), phone },
        delivery_address: market.placeName || (market.location ? `${market.location.lat}, ${market.location.lng}` : 'Delivery location not provided'),
        ...(forSomeoneElse ? { recipient: { name: recipient.name.trim(), phone: recipientPhone } } : {}),
        currency: paymentMethod === 'online' ? market.currency : 'TZS',
        quoted_payment_amount: quote.payment_amount,
      };
      if (paymentMethod === 'online') {
        const payment = await storefrontRequest<PaymentSession>('/payments/initialize', {
          ...input,
          ...(selectedProvider ? { payment_provider: selectedProvider.id } : {}),
          ...(providerNeedsPhone && paymentPhone.trim()
            ? { payment_phone: `${paymentPhoneDial}${paymentPhone.replace(/[^0-9]/g, '').replace(/^0/, '')}` }
            : {}),
        });
        if (selectedProvider?.id === 'pesapal') {
          window.location.assign(`/checkout/pesapal?tx_ref=${encodeURIComponent(payment.tx_ref ?? '')}&order_tracking_id=${encodeURIComponent(payment.order_tracking_id ?? '')}`);
          return;
        }
        window.location.assign(payment.payment_url);
        return;
      }
      const order = await storefrontRequest<OrderResult>('/orders/cash', {
        ...input,
        request_key: cashRequestKey.current ?? (cashRequestKey.current = crypto.randomUUID()),
      });
      setOrderId(order.order_id);
      if (currentQuoteKey.current === quoteKey) clear();
    } catch (cause) {
      if (cause instanceof StorefrontRequestError && cause.status === 409) {
        setQuotedBasket(null);
        setAcceptedFee(false);
        cashRequestKey.current = null;
        setQuoteRefreshVersion((version) => version + 1);
        setError('Your basket or delivery quote changed. Review the refreshed quote before continuing.');
      } else {
        setError(userFacingMessage(cause, 'Could not place your order.'));
      }
    } finally {
      setBusy(false);
    }
  }, [lines, market.location, market.placeName, market.currency, quote, quoteError, contact, phoneDial, forSomeoneElse, recipient, recipientDial, paymentPhone, paymentPhoneDial, selectedProvider, providerNeedsPhone, acceptedFee, paymentMethod, options, mode, effectiveMode, deliveryWindow, quoteKey, clear]);

  if (orderId) {
    return (
      <main className="mx-auto max-w-2xl px-5 py-20">
        <section className="rounded-3xl border border-line bg-white p-8 text-center shadow-soft">
          <p className="text-sm font-extrabold uppercase tracking-wide text-leaf-deep">Order received</p>
          <h1 className="mt-3 font-display text-3xl font-extrabold">Thank you for ordering with Saplaya.</h1>
          <p className="mt-3 text-ink-soft">Your order reference is <strong className="break-all text-ink">{orderId}</strong>.</p>
          <p className="mt-2 text-sm text-ink-mute">{forSomeoneElse ? 'The delivery team will contact the recipient using the details provided.' : 'The delivery team will contact you using the details provided.'}</p>
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
          <>
            <ul className="mt-6 space-y-3">
              {lines.map(({ product, qty }) => {
                const unitPrice = volumePrice(product, qty, preferredMode);
                return (
                  <li key={product.id} className="flex flex-col gap-3 rounded-2xl border border-line bg-white p-4 sm:flex-row sm:items-center sm:gap-4">
                    <SmartImage src={product.image_url ?? ''} alt={product.name} className="h-20 w-20 shrink-0 rounded-2xl" />
                    <div className="min-w-0 flex-1">
                      <h2 className="break-words font-bold">{product.name}</h2>
                      <p className="text-sm text-ink-mute">{product.category} · {unitPrice === null ? 'Price confirmed at checkout' : `${formatTZS(unitPrice)} per ${product.unit}`}</p>
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
                      <div className="text-right">
                        <p className="text-xs text-ink-mute">Line total</p>
                        <p className="text-lg font-extrabold" style={{ color: theme.accent }}>
                          {unitPrice === null ? '—' : formatTZS(unitPrice * qty)}
                        </p>
                      </div>
                      <button type="button" onClick={() => setQuantity(product.id, 0)} className="text-sm font-bold text-red-700 underline">Remove</button>
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className="mt-4 flex items-center justify-between rounded-2xl px-4 py-3" style={{ backgroundColor: theme.soft }}>
              <span className="font-bold" style={{ color: theme.accent }}>Basket total</span>
              <strong className="text-xl" style={{ color: theme.accent }}>
                {formatTZS(lines.reduce((total, line) => {
                  const unit = volumePrice(line.product, line.qty, preferredMode);
                  return unit === null ? total : total + unit * line.qty;
                }, 0))}
              </strong>
            </div>
          </>
        )}
      </section>

      <aside className="h-fit rounded-3xl border border-line bg-white p-5 shadow-soft" style={{ borderColor: `${theme.accent}66` }}>
        <h2 className="font-display text-xl font-extrabold" style={{ color: theme.accent }}>Delivery and payment</h2>
        <label className="mt-4 block text-sm font-bold">Currency
          <select value={market.currency} onChange={(event) => market.setCurrency(event.target.value)} className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2.5">
            {market.currencies.map((code) => <option key={code}>{code}</option>)}
          </select>
        </label>
        {setupError && <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-800">{setupError}</p>}
        <div className="mt-4 space-y-3">
          <button type="button" onClick={market.requestLocation} className="w-full rounded-xl border border-leaf px-4 py-3 text-left font-bold text-leaf-deep">
            Use my current location
          </button>
          {market.locationError && <p role="status" className="text-sm text-red-700">{market.locationError}</p>}
          {market.location && <p className="text-xs text-ink-mute">Coordinates are used to match farms and calculate delivery. They are not shown in the public shop.</p>}
          <DeliveryAddressSearch />

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
                const day = option.value === 'morning' || option.value === 'evening'
                  ? dailyDeliveryDay(option.value, deliveryClock)
                  : '';
                return <option key={option.value} value={option.value}>{day ? `${day} · ` : ''}{title} · {formatTZS(option.fee)}</option>;
              })}
            </select>
          </label>
          {isDailyDelivery && <p className="text-xs text-ink-mute">Delivery windows are shown in local time.</p>}

          <label className="block text-sm font-bold">Name
            <input value={contact.name} onChange={(event) => setContact((current) => ({ ...current, name: event.target.value }))} placeholder="Enter your full name" autoComplete="name" className="mt-1 w-full rounded-xl border border-line px-3 py-2.5 font-normal" />
          </label>
          <label className="block text-sm font-bold">Email
            <input type="email" value={contact.email} onChange={(event) => setContact((current) => ({ ...current, email: event.target.value }))} placeholder="Enter your email address" autoComplete="email" className="mt-1 w-full rounded-xl border border-line px-3 py-2.5 font-normal" />
          </label>
          <div className="grid grid-cols-[112px_1fr] gap-2">
            <div>
              <span className="mb-1 block text-sm font-bold">Country code</span>
              <CountryCodePicker value={phoneDial} onChange={setPhoneDial} />
            </div>
            <label className="block text-sm font-bold">Phone number
              <input type="tel" value={contact.phone} onChange={(event) => setContact((current) => ({ ...current, phone: event.target.value }))} placeholder="Phone number" autoComplete="tel" className="mt-1 w-full rounded-xl border border-line px-3 py-2.5 font-normal" />
            </label>
          </div>
          <label className="flex items-center gap-2 text-sm font-bold">
            <input type="checkbox" checked={forSomeoneElse} onChange={(event) => setForSomeoneElse(event.target.checked)} />
            I’m ordering for someone else
          </label>
          {forSomeoneElse && (
            <fieldset className="space-y-3 rounded-xl border border-line p-3">
              <legend className="px-1 text-sm font-bold">Recipient details</legend>
              <p className="text-xs text-ink-mute">Your receipt stays with you. Delivery goes to the confirmed destination above.</p>
              <label className="block text-sm font-bold">Recipient name
                <input value={recipient.name} maxLength={120} placeholder="Enter the recipient’s full name" onChange={(event) => setRecipient((current) => ({ ...current, name: event.target.value }))} className="mt-1 w-full rounded-xl border border-line px-3 py-2.5 font-normal" />
              </label>
              <div className="grid grid-cols-[112px_1fr] gap-2">
                <div>
                  <span className="mb-1 block text-sm font-bold">Country code</span>
                  <CountryCodePicker value={recipientDial} onChange={setRecipientDial} />
                </div>
                <label className="block text-sm font-bold">Recipient phone
                  <input type="tel" value={recipient.phone} maxLength={32} placeholder="Phone number" onChange={(event) => setRecipient((current) => ({ ...current, phone: event.target.value }))} className="mt-1 w-full rounded-xl border border-line px-3 py-2.5 font-normal" />
                </label>
              </div>
            </fieldset>
          )}

          {(options?.online_payment || options?.cash_on_delivery) && (
            <fieldset className="space-y-2">
              <legend className="mb-2 text-sm font-extrabold">Choose a payment method</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                {options?.online_payment && (
                  <label
                    className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-4 text-sm backdrop-blur-xl transition duration-200 focus-within:ring-2 focus-within:ring-leaf/40 ${
                      paymentMethod === 'online'
                        ? 'border-leaf bg-white/90 shadow-soft'
                        : 'border-white/80 bg-white/60 hover:bg-white/80'
                    }`}
                    style={paymentMethod === 'online' ? { borderColor: `${theme.accent}88`, boxShadow: `0 8px 24px ${theme.accent}18` } : undefined}
                  >
                    <input type="radio" name="payment" className="sr-only" checked={paymentMethod === 'online'} onChange={() => setPaymentMethod('online')} />
                    <span className="mt-0.5 rounded-xl bg-leaf/10 p-2 text-leaf-deep"><CreditCard size={19} aria-hidden="true" /></span>
                    <span>
                      <span className="block font-extrabold">Pay online securely</span>
                      <span className="mt-1 block text-xs font-medium leading-5 text-ink-mute">Mobile money, cards, wallets and other available methods</span>
                    </span>
                  </label>
                )}
                {options?.cash_on_delivery && (
                  <label
                    className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-4 text-sm backdrop-blur-xl transition duration-200 focus-within:ring-2 focus-within:ring-leaf/40 ${
                      paymentMethod === 'cash_on_delivery'
                        ? 'border-leaf bg-white/90 shadow-soft'
                        : 'border-white/80 bg-white/60 hover:bg-white/80'
                    }`}
                    style={paymentMethod === 'cash_on_delivery' ? { borderColor: `${theme.accent}88`, boxShadow: `0 8px 24px ${theme.accent}18` } : undefined}
                  >
                    <input type="radio" name="payment" className="sr-only" checked={paymentMethod === 'cash_on_delivery'} onChange={() => setPaymentMethod('cash_on_delivery')} />
                    <span className="mt-0.5 rounded-xl bg-amber-100/80 p-2 text-amber-800"><Wallet size={19} aria-hidden="true" /></span>
                    <span>
                      <span className="block font-extrabold">Payment on delivery</span>
                      <span className="mt-1 block text-xs font-medium leading-5 text-ink-mute">Pay when your order arrives</span>
                    </span>
                  </label>
                )}
              </div>
            </fieldset>
          )}

          {paymentMethod === 'online' && options?.online_payment && (
            <div className="space-y-3 rounded-2xl border border-white/80 bg-white/55 p-4 shadow-soft backdrop-blur-xl">
              {currencyProviders.length > 0 && (
                <fieldset className="space-y-2">
                  <legend className="text-sm font-extrabold">Choose how you’d like to pay</legend>
                  <div className="grid grid-cols-3 gap-2 rounded-2xl border border-white/80 bg-white/45 p-1.5 backdrop-blur-xl">
                    {availablePaymentChannels.map((channel) => {
                      const Icon = channel.icon;
                      const selected = selectedChannel?.id === channel.id;
                      return (
                        <label
                          key={channel.id}
                          className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl px-2 py-3 text-center text-xs font-extrabold transition focus-within:ring-2 focus-within:ring-leaf/40 ${
                            selected ? 'bg-white/95 text-leaf-deep shadow-soft' : 'text-ink-mute hover:bg-white/60'
                          }`}
                          style={selected ? { color: theme.accent, boxShadow: `0 5px 16px ${theme.accent}18` } : undefined}
                        >
                          <input
                            type="radio"
                            name="payment-channel"
                            className="sr-only"
                            checked={selected}
                            onChange={() => {
                              setPaymentChannel(channel.id);
                              setPreferredProvider('');
                            }}
                          />
                          <Icon size={17} aria-hidden="true" />
                          <span>{channel.label}</span>
                        </label>
                      );
                    })}
                  </div>
                  <p className="text-xs leading-5 text-ink-mute">Choose a gateway below. Its secure checkout confirms the exact methods available to you.</p>
                  {channelProviders.map((provider) => (
                    <label
                      key={provider.id}
                      className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 text-sm backdrop-blur transition ${
                        selectedProvider?.id === provider.id
                          ? 'border-leaf bg-white/90 shadow-sm'
                          : 'border-white/80 bg-white/55 hover:bg-white/85'
                      }`}
                      style={selectedProvider?.id === provider.id ? { borderColor: `${theme.accent}88` } : undefined}
                    >
                      <input type="radio" name="payment-provider" className="sr-only" checked={selectedProvider?.id === provider.id} onChange={() => setPreferredProvider(provider.id)} />
                      <span className="rounded-xl bg-leaf/10 p-2 text-leaf-deep">
                        {provider.requires_phone
                          ? <Smartphone size={18} aria-hidden="true" />
                          : provider.id === 'paypal'
                            ? <Wallet size={18} aria-hidden="true" />
                            : <CreditCard size={18} aria-hidden="true" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-extrabold">{provider.label}</span>
                        <span className="mt-0.5 block text-xs leading-5 text-ink-mute">{provider.methods.join(' · ')}</span>
                      </span>
                      <span aria-hidden="true" className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${selectedProvider?.id === provider.id ? 'border-leaf bg-leaf text-white' : 'border-line bg-white'}`}>
                        {selectedProvider?.id === provider.id && <span className="h-2 w-2 rounded-full bg-white" />}
                      </span>
                    </label>
                  ))}
                </fieldset>
              )}
              {providerNeedsPhone && (
                <>
                  <div className="grid grid-cols-[112px_1fr] gap-2">
                    <div>
                      <span className="mb-1 block text-sm font-bold">Country code</span>
                      <CountryCodePicker value={paymentPhoneDial} onChange={setPaymentPhoneDial} />
                    </div>
                    <label className="block text-sm font-bold">Mobile money number
                      <input
                        type="tel"
                        autoComplete="tel"
                        value={paymentPhone}
                        onChange={(event) => setPaymentPhone(event.target.value)}
                        placeholder="Optional"
                        className="mt-1 w-full rounded-xl border border-line px-3 py-2.5 font-normal"
                      />
                    </label>
                  </div>
                </>
              )}
              <p className="text-xs leading-5 text-ink-mute">
                {providerNeedsPhone
                  ? 'Enter a reachable mobile-money number. Never share your PIN with Saplaya.'
                  : 'Your payment details are entered only on the provider’s secure checkout.'}
              </p>
            </div>
          )}

          {quoteError && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{quoteError}</p>}
          {paymentMethod === 'online' && options && !options.payment_currencies.includes(market.currency) && <p role="alert" className="text-sm text-red-700">
            Online payments support {options.payment_currencies.join(', ')}. Choose a supported currency above, or pay on delivery in {options.cash_currency}.
          </p>}
          {quote && (
            <div className="space-y-2 border-t border-line pt-3 text-sm">
              <p className="flex justify-between"><span>Items (server quote)</span><strong>{formatTZS(quote.subtotal)}</strong></p>
              <p className="flex justify-between"><span>Delivery</span><strong>{formatTZS(quote.delivery_fee)}</strong></p>
              <p className="flex justify-between text-base"><span>Total</span><strong>{formatTZS(quote.amount)}</strong></p>
              <p className="flex flex-wrap justify-between gap-2 font-bold"><span>Amount to pay ({quote.payment_currency})</span><strong>{new Intl.NumberFormat(undefined, { style: 'currency', currency: quote.payment_currency }).format(quote.payment_amount)}</strong></p>
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
