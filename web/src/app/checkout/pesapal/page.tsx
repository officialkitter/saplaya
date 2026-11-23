'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

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
    <main className="mx-auto max-w-5xl px-3 py-4 sm:px-5 sm:py-8">
      <section className="overflow-hidden rounded-3xl border border-line bg-white shadow-soft">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-6">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-leaf-deep">Secure PesaPal checkout</p>
            <p className="mt-0.5 text-sm text-ink-mute">Encrypted payment · no card details leave PesaPal</p>
          </div>
          <Link href="/checkout" className="rounded-xl border border-line px-4 py-2 text-sm font-bold text-ink-soft">Cancel</Link>
        </div>
        {session ? (
          <iframe
            ref={frameRef}
            title="PesaPal secure payment checkout"
            src={session.redirect_url}
            className="block w-full border-0 bg-white"
            style={{ height: 'clamp(620px, calc(100dvh - 170px), 920px)', minHeight: '620px' }}
            allow="payment *"
            referrerPolicy="strict-origin-when-cross-origin"
            sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation"
          />
        ) : (
          <div className="grid min-h-[520px] place-items-center px-5 text-center">
            <p role="status" className="font-bold text-ink-soft">{message}</p>
          </div>
        )}
      </section>
    </main>
  );
}
