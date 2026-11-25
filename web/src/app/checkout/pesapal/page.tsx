'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { CreditCard, ShieldCheck } from 'lucide-react';

type Session = {
  redirect_url: string;
  tx_ref: string;
  order_tracking_id: string;
};

export default function PesapalEmbeddedCheckoutPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [message, setMessage] = useState('Preparing your secure checkout…');
  const frameRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    let active = true;
    const params = new URLSearchParams(window.location.search);
    const txRef = params.get('tx_ref') ?? '';
    const trackingId = params.get('order_tracking_id') ?? '';
    if (!/^saplaya-[0-9a-f-]{36}$/i.test(txRef) || !trackingId) {
      setMessage('This payment link is invalid.');
      return;
    }
    void (async () => {
      try {
        const sessionData = await import('@/lib/storefront-auth').then(({ storefrontRequest }) =>
          storefrontRequest<Session>(`/payments/pesapal/checkout-session?tx_ref=${encodeURIComponent(txRef)}&order_tracking_id=${encodeURIComponent(trackingId)}`),
        );
        if (!active) return;
        setSession(sessionData);
      } catch (error) {
        if (!active) return;
        setMessage(error instanceof Error ? error.message : 'The secure checkout could not be loaded.');
      }
    })();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (!session || event.origin !== window.location.origin) return;
      if (event.source !== frameRef.current?.contentWindow) return;
      const data = event.data as { type?: string; orderId?: string };
      if (data.type === 'saplaya:payment-complete' && data.orderId) {
        window.location.assign('/orders');
      }
    };
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, [session]);

  return (
    <main className="mx-auto max-w-6xl px-3 py-5 sm:px-5 sm:py-10">
      <section className="overflow-hidden rounded-[2rem] border border-white/75 bg-white/70 shadow-[0_24px_80px_rgba(27,65,48,0.12)] backdrop-blur-2xl">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/70 bg-gradient-to-r from-leaf/10 via-white/55 to-sky-50/70 px-4 py-5 sm:px-7">
          <div className="flex items-start gap-3">
            <span className="mt-1 rounded-2xl border border-white/80 bg-white/75 p-3 text-leaf-deep shadow-sm">
              <CreditCard size={21} aria-hidden="true" />
            </span>
            <div>
              <p className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-widest text-leaf-deep">
                <ShieldCheck size={15} aria-hidden="true" /> Secure PesaPal checkout
              </p>
              <h1 className="mt-1 font-display text-xl font-extrabold text-ink sm:text-2xl">Complete your payment</h1>
              <p className="mt-1 max-w-xl text-sm leading-5 text-ink-mute">
                Choose an available card, wallet or mobile-money method in Pesapal’s hosted checkout.
              </p>
            </div>
          </div>
          <Link href="/checkout" className="rounded-xl border border-white/80 bg-white/75 px-4 py-2 text-sm font-bold text-ink-soft shadow-sm transition hover:bg-white">Cancel</Link>
        </div>
        {session ? (
          <iframe
            ref={frameRef}
            title="PesaPal secure payment checkout"
            src={session.redirect_url}
            className="block w-full border-0 bg-transparent"
            style={{ height: 'clamp(680px, calc(100dvh - 190px), 980px)', minHeight: '680px' }}
            allow="payment *"
            referrerPolicy="strict-origin-when-cross-origin"
            sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation"
          />
        ) : (
          <div className="grid min-h-[520px] place-items-center px-5 text-center">
            <p role="status" className="font-bold text-ink-soft">{message}</p>
          </div>
        )}
        <p className="border-t border-white/70 bg-white/45 px-4 py-3 text-center text-xs leading-5 text-ink-mute sm:px-6">
          Your payment details are entered with Pesapal and are not stored by Saplaya.
        </p>
      </section>
    </main>
  );
}
