'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useStorefrontCart } from '@/lib/cart';
import { storefrontRequest } from '@/lib/storefront-auth';

export default function PaymentReturnPage() {
  const { clear } = useStorefrontCart();
  const [message, setMessage] = useState('Verifying your payment…');
  const [orderId, setOrderId] = useState('');
  const [canRetry, setCanRetry] = useState(false);

  useEffect(() => {
    let active = true;
    const params = new URLSearchParams(window.location.search);
    const txRef = params.get('tx_ref');
    const trackingId = params.get('order_tracking_id');
    if (!txRef || !trackingId) {
      setMessage('Payment details were not returned. Check your order status or contact support before trying again.');
      return () => { active = false; };
    }
    void storefrontRequest<{ order_id?: string; status?: string; message?: string }>('/payments/confirm', {
      tx_ref: txRef,
      order_tracking_id: trackingId,
    }).then((result) => {
      if (!active) return;
      if (!result.order_id) {
        setMessage(result.message ?? 'Payment is still being confirmed. Check again in a moment.');
        setCanRetry(true);
        return;
      }
      setOrderId(result.order_id);
      setMessage('Payment confirmed and your order is placed.');
      clear();
    }).catch((error: unknown) => {
      if (!active) return;
      setMessage(error instanceof Error ? error.message : 'Could not verify the payment.');
      setCanRetry(true);
    });
    return () => { active = false; };
  }, [clear]);

  return (
    <main className="mx-auto max-w-2xl px-5 py-20">
      <section className="rounded-3xl border border-line bg-white p-8 text-center shadow-soft">
        <h1 className="font-display text-3xl font-extrabold">{orderId ? 'Order confirmed' : 'Payment update'}</h1>
        <p role="status" className="mt-3 text-ink-soft">{message}</p>
        {orderId && <p className="mt-2 break-all text-sm font-bold">Order reference: {orderId}</p>}
        {canRetry && !orderId && (
          <button type="button" onClick={() => window.location.reload()} className="mt-4 rounded-xl border border-line px-5 py-3 font-bold">
            Check payment again
          </button>
        )}
        <div className="mt-6 flex justify-center gap-3">
          <Link className="rounded-xl bg-leaf px-5 py-3 font-bold text-white" href="/orders">View order status</Link>
          <Link className="rounded-xl border border-line px-5 py-3 font-bold" href="/">Continue shopping</Link>
        </div>
      </section>
    </main>
  );
}
