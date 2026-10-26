'use client';

import { motion } from 'framer-motion';
import { Ban, ClipboardList, DoorOpen, Lock, Search, ShoppingBag, Truck } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Guarded, PageHeader } from '@/components/admin/Guard';
import { Button } from '@/components/ui/Button';
import { EmptyState, StatusPill } from '@/components/ui/Bits';
import { Field, Input, Select } from '@/components/ui/Fields';
import { Drawer, Modal } from '@/components/ui/Modal';
import { SmartImage } from '@/components/ui/SmartImage';
import { cn, formatNum, formatTZS, nextStatus, STATUS, STATUS_ALL, STATUS_FLOW, timeAgo } from '@/lib/format';
import { can, isFarmRole } from '@/lib/roles';
import { customerLabel, customerPhone, orderTotal } from '@/lib/stats';
import { useDB, useScope, useToast } from '@/lib/store';
import type { OrderStatus, Role, SupplierOrder } from '@/lib/types';

const NODES = [
  { status: 'pending' as const, icon: ClipboardList, label: 'Received' },
  { status: 'packing' as const, icon: ShoppingBag, label: 'Packing' },
  { status: 'en_route' as const, icon: Truck, label: 'On the way' },
  { status: 'delivered' as const, icon: DoorOpen, label: 'Delivered' },
];

/** What this person may do to an order right now. */
function actionsFor(role: Role, status: OrderStatus) {
  const allowed = can(role, 'orders.update_status');
  const next = nextStatus(status);
  const driver = role === 'driver';
  return {
    next: allowed && next && (!driver || next === 'en_route' || next === 'delivered') ? next : null,
    cancel: allowed && !driver && (status === 'pending' || status === 'packing'),
  };
}

function Pipeline({ status }: { status: OrderStatus }) {
  const cancelled = status === 'cancelled';
  const current = STATUS_FLOW.indexOf(status);
  return (
    <div className="flex items-start">
      {NODES.map((n, i) => {
        const reached = cancelled || i <= current;
        const color = cancelled ? STATUS.cancelled.color : STATUS[n.status].color;
        const Icon = cancelled && i === 0 ? Ban : n.icon;
        return (
          <div key={n.status} className="flex flex-1 items-start last:flex-none">
            <div className="flex w-[72px] flex-col items-center">
              <motion.span
                animate={{
                  backgroundColor: reached ? color : '#FFFFFF',
                  borderColor: reached ? color : '#E3EBE0',
                  color: reached ? '#FFFFFF' : '#6B7A6C',
                  boxShadow: reached ? `0 0 22px 3px ${color}77` : '0 0 0 0 rgba(0,0,0,0)',
                  scale: !cancelled && i === current ? 1.12 : 1,
                }}
                transition={{ type: 'spring', damping: 14, stiffness: 180 }}
                className="grid h-14 w-14 place-items-center rounded-full border-[3px]"
              >
                <Icon size={26} />
              </motion.span>
              <span className={cn('mt-2 text-center text-xs font-bold', reached ? 'text-ink' : 'text-ink-mute')}>{n.label}</span>
            </div>
            {i < NODES.length - 1 && (
              <div className="mx-[-8px] mt-[26px] h-1.5 flex-1 overflow-hidden rounded-full bg-line">
                <motion.div initial={false} animate={{ width: cancelled || i < current ? '100%' : '0%', backgroundColor: cancelled ? STATUS.cancelled.color : STATUS[NODES[i + 1].status].color }} transition={{ duration: 0.6 }} className="h-full" />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Orders() {
  const { me, farmId, suppliers, products, orders } = useScope();
  const setOrderStatus = useDB((s) => s.setOrderStatus);
  const push = useToast((s) => s.push);

  const [filter, setFilter] = useState<OrderStatus | 'all'>('all');
  const [q, setQ] = useState('');
  const [farm, setFarm] = useState('all');
  const [limit, setLimit] = useState(15);
  const [openId, setOpenId] = useState<string | null>(null);
  const [cancelId, setCancelId] = useState<string | null>(null);

  useEffect(() => {
    const h = window.location.hash.replace('#', '');
    if ((STATUS_ALL as string[]).includes(h)) setFilter(h as OrderStatus);
  }, []);

  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const farmName = useMemo(() => new Map(suppliers.map((s) => [s.id, s.name])), [suppliers]);

  const visible = useMemo(() => {
    const term = q.trim().toLowerCase();
    return orders.filter((o) => {
      if (filter !== 'all' && o.status !== filter) return false;
      if (farm !== 'all' && o.supplierId !== farm) return false;
      if (!term) return true;
      return o.code.toLowerCase().includes(term) || o.customerName.toLowerCase().includes(term) || o.area.toLowerCase().includes(term);
    });
  }, [orders, filter, q, farm]);

  if (!me) return null;
  const open = orders.find((o) => o.id === openId) ?? null;
  const cancelling = orders.find((o) => o.id === cancelId) ?? null;
  const counts = (s: OrderStatus | 'all') => (s === 'all' ? orders.length : orders.filter((o) => o.status === s).length);
  const tabs: (OrderStatus | 'all')[] = me.role === 'driver' ? ['all', 'packing', 'en_route', 'delivered'] : ['all', ...STATUS_ALL];

  async function advance(o: SupplierOrder) {
    const a = actionsFor(me!.role, o.status);
    if (!a.next) return;
    try {
      await setOrderStatus(o.id, a.next);
      push(`${o.code} is now ${STATUS[a.next].label.toLowerCase()}. The customer sees this in their app.`);
    } catch (error) {
      push(error instanceof Error ? error.message : 'Could not update the order.', 'bad');
    }
  }

  async function cancelOrder() {
    if (!cancelling) return;
    try {
      await setOrderStatus(cancelling.id, 'cancelled');
      push(`${cancelling.code} was cancelled and the stock was returned.`, 'info');
      setCancelId(null);
    } catch (error) {
      push(error instanceof Error ? error.message : 'Could not cancel the order.', 'bad');
    }
  }

  function ActionButtons({ o, size = 'sm' }: { o: SupplierOrder; size?: 'sm' | 'md' }) {
    const a = actionsFor(me!.role, o.status);
    if (!a.next && !a.cancel) return null;
    return (
      <div className="flex flex-wrap gap-2">
        {a.next && <Button size={size} variant={a.next === 'delivered' ? 'primary' : 'sun'} onClick={() => { void advance(o); }}>{STATUS[o.status].verb}</Button>}
        {a.cancel && <Button size={size} variant="danger" onClick={() => setCancelId(o.id)}>Cancel</Button>}
      </div>
    );
  }

  return (
    <>
      <PageHeader
        title="Orders"
        subtitle={farmId ? 'Pack what is new, send out what is packed. Customers see every change in their app.' : 'Every farm’s part of every order, newest first.'}
      />

      <div className="mb-5 flex flex-wrap gap-2" role="tablist" aria-label="Order status">
        {tabs.map((t) => {
          const active = filter === t;
          const color = t === 'all' ? '#2E7D32' : STATUS[t].color;
          return (
            <button
              key={t}
              role="tab"
              aria-selected={active}
              onClick={() => { setFilter(t); setLimit(15); }}
              className={cn('flex items-center gap-2 rounded-full border-2 px-4 py-2 text-[15px] font-bold transition', active ? 'border-transparent text-white' : 'border-line bg-white text-ink-soft hover:border-sprout')}
              style={active ? { backgroundColor: color, color: t === 'pending' ? '#15261A' : '#fff' } : undefined}
            >
              {t !== 'all' && !active && <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />}
              {t === 'all' ? 'All' : STATUS[t].label}
              <span className={cn('rounded-full px-2 text-sm', active ? 'bg-white/25' : 'bg-leaf-soft text-leaf-deep')}>{counts(t)}</span>
            </button>
          );
        })}
      </div>

      <div className="mb-5 grid gap-3 sm:grid-cols-[1fr_auto]">
        <div className="relative">
          <Search size={20} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-mute" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by order number, customer or area" className="pl-12" aria-label="Search orders" />
        </div>
        {!farmId && (
          <div className="sm:w-60">
            <Select value={farm} onChange={(e) => setFarm(e.target.value)} aria-label="Filter by farm">
              <option value="all">All farms</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </div>
        )}
      </div>

      {visible.length === 0 ? (
        <EmptyState icon={<ClipboardList size={36} />} title="No orders here" hint={q ? 'Try a different word, or clear the search.' : 'New orders show up here the moment a customer places them.'} action={q || filter !== 'all' ? <Button variant="soft" onClick={() => { setQ(''); setFilter('all'); setFarm('all'); }}>Show all orders</Button> : undefined} />
      ) : (
        <ul className="space-y-3">
          {visible.slice(0, limit).map((o, i) => (
            <motion.li
              key={o.id}
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 8) * 0.03 }}
              className="rounded-3xl border border-line bg-white p-4 shadow-soft"
            >
              <div className="grid items-center gap-3 md:grid-cols-[auto_1.3fr_1fr_auto_auto]">
                <button onClick={() => setOpenId(o.id)} className="flex -space-x-3 text-left" aria-label={`Open order ${o.code}`}>
                  {o.items.slice(0, 3).map((it) => {
                    const p = byId.get(it.productId);
                    return <SmartImage key={it.productId} src={p?.image} alt={p?.name ?? 'Item'} emoji={p?.emoji} className="h-14 w-14 rounded-2xl text-xl ring-2 ring-white" />;
                  })}
                </button>
                <button onClick={() => setOpenId(o.id)} className="min-w-0 text-left">
                  <p className="font-display text-lg font-extrabold">{o.code}{!farmId && <span className="ml-2 text-[15px] font-semibold text-leaf">{farmName.get(o.supplierId)}</span>}</p>
                  <p className="truncate text-ink-soft">{customerLabel(o, me.role)} · {o.area} · {o.mode === 'wholesale' ? 'Wholesale' : 'Retail'}</p>
                  <p className="text-sm text-ink-mute">{timeAgo(o.placedAt)}</p>
                </button>
                <p className="hidden text-ink-soft md:block">{o.items.length} item{o.items.length === 1 ? '' : 's'}: {o.items.map((it) => byId.get(it.productId)?.name).filter(Boolean).slice(0, 2).join(', ')}{o.items.length > 2 ? '…' : ''}</p>
                <div className="flex items-center justify-between gap-3 md:block md:text-right">
                  <p className="font-extrabold">{formatTZS(orderTotal(o))}</p>
                  <StatusPill status={o.status} className="md:mt-1" />
                </div>
                <ActionButtons o={o} />
              </div>
            </motion.li>
          ))}
        </ul>
      )}

      {visible.length > limit && (
        <div className="mt-5 text-center"><Button variant="soft" onClick={() => setLimit((l) => l + 15)}>Show more orders</Button></div>
      )}

      <Drawer open={!!open} onClose={() => setOpenId(null)} title={open ? `Order ${open.code}` : 'Order'}>
        {open && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <StatusPill status={open.status} />
              <p className="text-ink-mute">{timeAgo(open.placedAt)}</p>
            </div>
            <div className="rounded-3xl bg-white p-5 shadow-soft"><Pipeline status={open.status} /></div>

            <div className="grid grid-cols-2 gap-3 text-[15px]">
              <div className="rounded-2xl bg-white p-4"><p className="text-ink-mute">Customer</p><p className="font-bold">{customerLabel(open, me.role)}</p></div>
              <div className="rounded-2xl bg-white p-4"><p className="text-ink-mute">Delivery area</p><p className="font-bold">{open.area}</p></div>
              <div className="rounded-2xl bg-white p-4"><p className="text-ink-mute">Phone</p><p className={cn('font-bold', isFarmRole(me.role) && 'text-ink-mute')}>{customerPhone(open, me.role)}</p></div>
              <div className="rounded-2xl bg-white p-4"><p className="text-ink-mute">Shopping mode</p><p className="font-bold">{open.mode === 'wholesale' ? 'Wholesale' : 'Retail'}</p></div>
              <div className="rounded-2xl bg-white p-4"><p className="text-ink-mute">Delivery window</p><p className="font-bold">{open.deliveryWindow === 'afternoon' ? '15:00–18:00' : '07:00–10:00'}</p></div>
              <div className="rounded-2xl bg-white p-4"><p className="text-ink-mute">Payment</p><p className="font-bold">{open.paymentMethod === 'cash_on_delivery' ? 'Cash on delivery' : 'Paid online'}</p></div>
            </div>

            {isFarmRole(me.role) && (
              <p className="flex items-start gap-3 rounded-2xl bg-sun-soft p-4 text-[15px] text-ink-soft">
                <Lock size={18} className="mt-0.5 shrink-0 text-sun-deep" />
                To protect customers, farms only see a first name and the delivery area. The driver has the phone number.
              </p>
            )}

            <div>
              <h3 className="mb-2 font-display text-lg font-extrabold">What to pack</h3>
              <ul className="divide-y divide-line rounded-3xl bg-white px-4">
                {open.items.map((it) => {
                  const p = byId.get(it.productId);
                  return (
                    <li key={it.productId} className="flex items-center gap-3 py-3">
                      <SmartImage src={p?.image} alt={p?.name ?? 'Item'} emoji={p?.emoji} className="h-14 w-14 shrink-0 rounded-2xl text-xl" />
                      <div className="min-w-0 flex-1">
                        <p className="font-bold">{p?.name ?? 'Item'}</p>
                        <p className="text-sm text-ink-mute">{formatNum(it.qty)} {p?.unit} at {formatTZS(it.unitPrice)}</p>
                      </div>
                      <p className="font-extrabold">{formatTZS(it.qty * it.unitPrice)}</p>
                    </li>
                  );
                })}
                <li className="flex items-center justify-between py-3 font-display text-lg font-extrabold">
                  <span>Total</span><span>{formatTZS(orderTotal(open))}</span>
                </li>
              </ul>
            </div>
            <ActionButtons o={open} size="md" />
          </div>
        )}
      </Drawer>

      <Modal open={!!cancelling} onClose={() => setCancelId(null)} title="Cancel this order?">
        {cancelling && (
          <div className="space-y-4">
            <p className="text-lg text-ink-soft">
              Order <b className="text-ink">{cancelling.code}</b> will be cancelled and the customer is told. The items go back into your stock.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setCancelId(null)}>Keep order</Button>
              <Button variant="danger" onClick={() => { void cancelOrder(); }}>Yes, cancel it</Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}

export default function OrdersPage() {
  return (
    <Guarded perm="orders.view">
      <Orders />
    </Guarded>
  );
}
