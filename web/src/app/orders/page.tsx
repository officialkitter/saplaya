'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { storefrontRequest } from '@/lib/storefront-auth';

type Order = {
  id: string;
  status: string;
  subtotal: number;
  delivery_fee: number;
  created_at: string;
  order_items: { qty: number; unit_price: number; products: { name: string; unit: string } | null }[];
};

const STATUS: Record<string, string> = {
  pending: 'Order received',
  packing: 'Being prepared',
  en_route: 'On the way',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

function formatTZS(amount: number) {
  return new Intl.NumberFormat('en-TZ', { style: 'currency', currency: 'TZS', maximumFractionDigits: 0 }).format(amount);
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const load = () => {
      void storefrontRequest<Order[]>('/orders').then((result) => {
        if (active) {
          setOrders(result);
          setError('');
        }
      }).catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : 'Could not load your orders.');
      });
    };
    load();
    const interval = window.setInterval(load, 30_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  return (
    <main className="mx-auto max-w-4xl px-5 py-10">
      <Link href="/" className="text-sm font-bold text-leaf-deep underline">Continue browsing</Link>
      <h1 className="mt-4 font-display text-3xl font-extrabold">Your orders</h1>
      {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-4 text-red-800">{error}</p>}
      {!error && orders.length === 0 ? (
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
                <span className="rounded-full bg-leaf-soft px-3 py-1.5 text-sm font-extrabold text-leaf-deep">{STATUS[order.status] ?? order.status}</span>
              </div>
              <ul className="mt-4 space-y-1 text-sm text-ink-soft">
                {order.order_items.map((item, index) => (
                  <li key={`${order.id}-${index}`} className="flex justify-between gap-3">
                    <span>{item.products?.name ?? 'Product'} · {item.qty} {item.products?.unit ?? ''}</span>
                    <span>{formatTZS(item.qty * item.unit_price)}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-4 border-t border-line pt-3 text-right font-bold">
                Total {formatTZS(order.subtotal + order.delivery_fee)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
