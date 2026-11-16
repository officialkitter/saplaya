'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { loadStripe, type Appearance, type Stripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';

type PendingSession = {
  status: 'pending';
  publishable_key: string;
  client_secret: string;
  amount: number;
  currency: string;
  return_url: string;
};
type ElementsSession = PendingSession | { status: 'paid' | 'failed' | 'completed' | 'expired'; return_url: string };

const appearance: Appearance = {
  theme: 'stripe',
  variables: {
    colorPrimary: '#2E7D32',
    colorText: '#15261A',
    colorTextSecondary: '#46604B',
    colorDanger: '#B3261E',
    colorBackground: '#FFFFFF',
    borderRadius: '12px',
    fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    spacingUnit: '4px',
  },
  rules: {
    '.Input': { border: '1px solid #E3EBE0', boxShadow: 'none', padding: '12px' },
    '.Input:focus': { borderColor: '#2E7D32', boxShadow: '0 0 0 3px #E8F5E9' },
    '.Tab': { border: '1px solid #E3EBE0', boxShadow: 'none' },
    '.Tab--selected': { borderColor: '#2E7D32', boxShadow: '0 0 0 1px #2E7D32' },
    '.Label': { fontWeight: '600' },
  },
};

function formatAmount(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount);
  } catch {
    return `${currency} ${amount}`;
  }
}

// Only follow the return URL if it is the Saplaya API callback, so a tampered response cannot redirect elsewhere.
function safeReturnUrl(raw: string, apiUrl: string): string | null {
  try {
    const url = new URL(raw);
    if (url.origin !== new URL(apiUrl).origin || url.pathname !== '/payments/callback') return null;
    return url.toString();
  } catch {
    return null;
  }
}

function PaymentForm({ amount, currency, returnUrl }: { amount: number; currency: string; returnUrl: string }) {
  const stripe = useStripe();
  const elements = useElements();
  const [ready, setReady] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (ready) return undefined;
    const timer = window.setTimeout(() => {
      setError('Secure card fields could not load. Check your connection, then refresh this page.');
    }, 20_000);
    return () => window.clearTimeout(timer);
  }, [ready]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!stripe || !elements || !ready || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const { error: submitError } = await elements.submit();
      if (submitError) {
        setError(submitError.message ?? 'Check your payment details.');
        return;
      }
      const result = await stripe.confirmPayment({
        elements,
        confirmParams: { return_url: returnUrl },
        redirect: 'if_required',
      });
      if (result.error) {
        const known = result.error.type === 'card_error' || result.error.type === 'validation_error';
        setError(known && result.error.message ? result.error.message : 'The payment could not be completed. Please try again.');
        return;
      }
      // The order is created server-side only after the API re-verifies this PaymentIntent with Stripe.
      window.location.assign(returnUrl);
    } catch {
      setError('Payment confirmation was interrupted. Check your order status before trying again to avoid paying twice.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <PaymentElement
        onReady={() => { setReady(true); setError(''); }}
        onLoadError={() => setError('Secure card fields could not load. Check your connection, then refresh this page.')}
        options={{ layout: { type: 'accordion', defaultCollapsed: false, radios: 'always', spacedAccordionItems: true } }}
      />
      {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>}
      <button
        type="submit"
        disabled={!stripe || !ready || submitting}
        className="w-full rounded-xl bg-leaf px-5 py-4 text-base font-extrabold text-white transition hover:bg-leaf-deep disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? 'Processing payment…' : `Pay ${formatAmount(amount, currency)}`}
      </button>
      <p className="text-center text-xs text-ink-mute">
        Payments are encrypted and processed by Stripe. Saplaya never sees or stores your card details.
      </p>
    </form>
  );
}

export default function StripePaymentPage() {
  const [session, setSession] = useState<PendingSession | null>(null);
  const [message, setMessage] = useState('Preparing secure payment…');
  const [stripePromise, setStripePromise] = useState<Promise<Stripe | null> | null>(null);
  const [returnUrl, setReturnUrl] = useState('');

  useEffect(() => {
    let active = true;
    const apiUrl = process.env.NEXT_PUBLIC_API_URL?.replace(/\/+$/, '');
    const txRef = new URLSearchParams(window.location.search).get('tx_ref') ?? '';
    if (!apiUrl || !/^saplaya-[0-9a-f-]{36}$/i.test(txRef)) {
      setMessage('This payment link is invalid. Return to checkout and try again.');
      return () => { active = false; };
    }
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 20_000);
    fetch(`${apiUrl}/payments/stripe/elements-session?tx_ref=${encodeURIComponent(txRef)}`, { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        const body = await response.json().catch(() => ({})) as ElementsSession & { error?: string };
        if (!active) return;
        if (!response.ok) {
          setMessage(body.error ?? 'Payment is temporarily unavailable.');
          return;
        }
        const target = safeReturnUrl(body.return_url, apiUrl);
        if (!target) {
          setMessage('Payment could not be prepared safely. Please contact support.');
          return;
        }
        if (body.status !== 'pending') {
          window.location.replace(target);
          return;
        }
        setReturnUrl(target);
        setStripePromise(loadStripe(body.publishable_key).then((stripe) => {
          if (!stripe) throw new Error('Stripe.js did not initialize.');
          return stripe;
        }).catch(() => {
          if (active) {
            setSession(null);
            setMessage('Secure payment could not load. Check your connection, then refresh this page.');
          }
          return null;
        }));
        setSession(body);
      })
      .catch(() => {
        if (active) setMessage('Could not reach the payment service. Check your connection and try again.');
      });
    return () => {
      active = false;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, []);

  const options = useMemo(() => (session ? { clientSecret: session.client_secret, appearance } : undefined), [session]);

  return (
    <main className="mx-auto max-w-xl px-4 py-10 sm:py-16">
      <section className="rounded-3xl border border-line bg-white p-6 shadow-soft sm:p-8">
        <p className="text-xs font-bold uppercase tracking-widest text-leaf">Secure checkout</p>
        <h1 className="mt-1 font-display text-2xl font-extrabold sm:text-3xl">Complete your payment</h1>
        {session && options && stripePromise ? (
          <>
            <div className="mt-5 flex items-center justify-between rounded-2xl bg-leaf-soft px-4 py-3">
              <span className="font-semibold text-ink-soft">Total due</span>
              <span className="text-xl font-extrabold">{formatAmount(session.amount, session.currency)}</span>
            </div>
            <div className="mt-6">
              <Elements stripe={stripePromise} options={options}>
                <PaymentForm amount={session.amount} currency={session.currency} returnUrl={returnUrl} />
              </Elements>
            </div>
          </>
        ) : (
          <p role="status" className="mt-4 text-ink-soft">{message}</p>
        )}
        <div className="mt-6 text-center">
          <Link href="/checkout" className="text-sm font-bold text-ink-soft underline">Back to checkout</Link>
        </div>
      </section>
    </main>
  );
}
