'use client';

import { userFacingMessage } from '@/lib/user-facing-error';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { storefrontRequest } from '@/lib/storefront-auth';
import { useGlobalMarket } from '@/lib/global-market';

type Order = {
  id: string;
  status: string;
  subtotal: number;
  delivery_fee: number;
  created_at: string;
  delivery_window: string | null;
  payment_method: string | null;
  order_items: { qty: number; unit_price: number; products: { name: string; unit: string } | null }[];
};

const STATUS: Record<string, string> = {
  pending: 'Order received',
  packing: 'Being prepared',
  en_route: 'On the way',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};
const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-sun-soft text-sun-deep',
  packing: 'bg-[#FFF4D6] text-[#8A5A00]',
  en_route: 'bg-[#E8F0FF] text-[#2457A7]',
  delivered: 'bg-leaf-soft text-leaf-deep',
  cancelled: 'bg-red-50 text-red-700',
};

export default function OrdersPage() {
  const { formatPrice, currency, ratesLoading, ratesUnavailable } = useGlobalMarket();
  const [orders, setOrders] = useState<Order[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let active = true;
    const load = () => {
      void storefrontRequest<Order[]>('/orders').then((result) => {
        if (active) {
          setOrders(result);
          setError('');
        }
      }).catch((cause: unknown) => {
        if (active) setError(userFacingMessage(cause, 'Could not load your orders.'));
      }).finally(() => {
        if (active) setLoading(false);
      });
    };
    load();
    const interval = window.setInterval(load, 30_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [refresh]);

  return (
    <main className="mx-auto max-w-4xl px-5 py-10">
      <Link href="/" className="text-sm font-bold text-leaf-deep underline">Continue browsing</Link>
      <h1 className="mt-4 font-display text-3xl font-extrabold">Your orders</h1>
      <p className="mt-2 text-sm text-ink-soft">Guest orders are available in this browser session. Keep this browser’s site data to continue tracking them.</p>
      {ratesLoading ? <p role="status" className="mt-2 text-sm text-ink-mute">Loading exchange rates; prices may appear in TZS.</p> : ratesUnavailable ? <p role="status" className="mt-2 text-sm text-ink-mute">Some exchange rates are unavailable. Current display currency: {currency}.</p> : currency !== 'TZS' ? <p className="mt-2 text-sm text-ink-mute">Converted prices are approximate.</p> : null}
      {error && <div role="alert" className="mt-4 rounded-xl bg-red-50 p-4 text-red-800">{error} <button type="button" className="font-bold underline" onClick={() => setRefresh((value) => value + 1)}>Try again</button></div>}
      {loading && orders.length === 0 ? <p role="status" className="mt-6">Loading your orders…</p> : !error && orders.length === 0 ? (
        <p className="mt-6 rounded-2xl border border-line bg-white p-6 text-ink-soft">No orders are linked to this browser session.</p>
      ) : (
        <ul className="mt-6 space-y-4">
          {orders.map((order) => (
            <li key={order.id} className="rounded-2xl border border-line bg-white p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-sm font-bold">{order.id}</p>
                  <p className="mt-1 text-sm text-ink-mute">{new Date(order.created_at).toLocaleString()}</p>
                </div>
                <p className="mt-3 text-sm text-ink-soft">{order.delivery_window === 'morning' ? 'Morning (07:00–10:00)' : order.delivery_window === 'evening' ? 'Evening (15:00–18:00)' : order.delivery_window ? `Within ${order.delivery_window}` : 'Delivery timeframe unavailable'} · {order.payment_method === 'cash_on_delivery' ? 'Payment on delivery' : 'Online payment'}</p>
                <span className={`rounded-full px-3 py-1.5 text-sm font-extrabold ${STATUS_COLORS[order.status] ?? 'bg-leaf-soft text-leaf-deep'}`}>{STATUS[order.status] ?? order.status}</span>
              </div>
              <ul className="mt-4 space-y-1 text-sm text-ink-soft">
                {order.order_items.map((item, index) => (
                  <li key={`${order.id}-${index}`} className="flex justify-between gap-3">
                    <span>{item.products?.name ?? 'Product'} · {item.qty} {item.products?.unit ?? ''}</span>
                    <span>{formatPrice(item.qty * item.unit_price)}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-4 border-t border-line pt-3 text-right font-bold">
                Total {formatPrice(order.subtotal + order.delivery_fee)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
