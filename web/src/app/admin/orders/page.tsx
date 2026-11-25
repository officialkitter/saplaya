'use client';

import { userFacingMessage } from '@/lib/user-facing-error';
import { motion } from 'framer-motion';
import { Ban, ClipboardList, DoorOpen, Lock, Plus, Search, ShoppingBag, Truck } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Guarded, PageHeader } from '@/components/admin/Guard';
import { Button } from '@/components/ui/Button';
import { EmptyState, StatusPill } from '@/components/ui/Bits';
import { Field, Input, Select } from '@/components/ui/Fields';
import { Drawer, Modal } from '@/components/ui/Modal';
import { SmartImage } from '@/components/ui/SmartImage';
import { cn, formatNum, nextStatus, STATUS, STATUS_ALL, STATUS_FLOW, timeAgo } from '@/lib/format';
import { useGlobalMarket } from '@/lib/global-market';
import { can, isFarmRole } from '@/lib/roles';
import { customerLabel, customerPhone, orderTotal } from '@/lib/stats';
import { useDB, useScope, useToast } from '@/lib/store';
import type { OrderStatus, Perm, Role, SupplierOrder } from '@/lib/types';

const NODES = [
  { status: 'pending' as const, icon: ClipboardList, label: 'Received' },
  { status: 'packing' as const, icon: ShoppingBag, label: 'Packing' },
  { status: 'en_route' as const, icon: Truck, label: 'On the way' },
  { status: 'delivered' as const, icon: DoorOpen, label: 'Delivered' },
];

/** What this person may do to an order right now. */
function actionsFor(role: Role, status: OrderStatus, permissions?: Perm[]) {
  const allowed = can(role, 'orders.update_status', permissions);
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
  const { formatPrice } = useGlobalMarket();
  const { me, farmId, suppliers, products, orders } = useScope();
  const setOrderStatus = useDB((s) => s.setOrderStatus);
  const addOrder = useDB((s) => s.addOrder);
  const push = useToast((s) => s.push);

  const [filter, setFilter] = useState<OrderStatus | 'all'>('all');
  const [q, setQ] = useState('');
  const [farm, setFarm] = useState('all');
  const [limit, setLimit] = useState(15);
  const [openId, setOpenId] = useState<string | null>(null);
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null);
  const busyOrder = useRef<string | null>(null);
  const [addingOrder, setAddingOrder] = useState(false);
  const [savingOrder, setSavingOrder] = useState(false);
  const savingOrderRef = useRef(false);
  const [orderQuery, setOrderQuery] = useState('');
  const [orderItems, setOrderItems] = useState<Record<string, number>>({});
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerPhoneInput, setCustomerPhoneInput] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [recipientPhone, setRecipientPhone] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [deliveryWindow, setDeliveryWindow] = useState('morning');

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
    const a = actionsFor(me!.role, o.status, me!.permissions);
    if (!a.next || busyOrder.current) return;
    busyOrder.current = o.id;
    setBusyOrderId(o.id);
    try {
      await setOrderStatus(o.id, a.next);
      push(`${o.code} is now ${STATUS[a.next].label.toLowerCase()}. The customer sees this in their app.`);
    } catch (error) {
      push(userFacingMessage(error, 'Could not update the order.'), 'bad');
    } finally {
      busyOrder.current = null;
      setBusyOrderId(null);
    }
  }

  async function cancelOrder() {
    if (!cancelling || busyOrder.current) return;
    busyOrder.current = cancelling.id;
    setBusyOrderId(cancelling.id);
    try {
      await setOrderStatus(cancelling.id, 'cancelled');
      push(`${cancelling.code} was cancelled and the stock was returned.`, 'info');
      setCancelId(null);
    } catch (error) {
      push(userFacingMessage(error, 'Could not cancel the order.'), 'bad');
    } finally {
      busyOrder.current = null;
      setBusyOrderId(null);
    }
  }

  function openAddOrder() {
    setOrderQuery('');
    setOrderItems({});
    setCustomerName('');
    setCustomerEmail('');
    setCustomerPhoneInput('');
    setRecipientName('');
    setRecipientPhone('');
    setDeliveryAddress('');
    setDeliveryWindow('morning');
    setAddingOrder(true);
  }

  const orderProductOptions = useMemo(() => {
    const term = orderQuery.trim().toLowerCase();
    return products
      .filter((product) => product.active && product.stock > 0)
      .filter((product) => (farmId ? product.supplierId === farmId : true))
      .filter((product) => !term
        || product.name.toLowerCase().includes(term)
        || product.category.toLowerCase().includes(term));
  }, [products, orderQuery, farmId]);

  async function saveNewOrder() {
    if (savingOrderRef.current) return;
    const items = Object.entries(orderItems)
      .filter(([, qty]) => qty > 0)
      .map(([productId, qty]) => ({ productId, qty }));
    if (!customerName.trim() || !/^\S+@\S+\.\S+$/.test(customerEmail) || customerPhoneInput.trim().length < 5) {
      push('Enter the customer name, email and phone.', 'bad');
      return;
    }
    if ((recipientName.trim() && !/^\+[1-9]\d{7,14}$/.test(recipientPhone))
      || (!recipientName.trim() && recipientPhone.trim())) {
      push('If you add recipient details, enter the recipient name and a valid +phone number.', 'bad');
      return;
    }
    if (!items.length) {
      push('Choose at least one product.', 'bad');
      return;
    }
    savingOrderRef.current = true;
    setSavingOrder(true);
    try {
      const result = await addOrder({
        customerName: customerName.trim(),
        customerEmail: customerEmail.trim(),
        customerPhone: customerPhoneInput.trim(),
        recipientName: recipientName.trim() || undefined,
        recipientPhone: recipientPhone.trim() || undefined,
        deliveryAddress: deliveryAddress.trim() || undefined,
        deliveryWindow,
        mode: 'retail',
        items,
      });
      push(`Order ${result.order_id.slice(0, 8).toUpperCase()} was added.`);
      setAddingOrder(false);
    } catch (error) {
      push(userFacingMessage(error, 'Could not add this order.',), 'bad');
    } finally {
      savingOrderRef.current = false;
      setSavingOrder(false);
    }
  }

  function ActionButtons({ o, size = 'sm' }: { o: SupplierOrder; size?: 'sm' | 'md' }) {
    const a = actionsFor(me!.role, o.status, me!.permissions);
    if (!a.next && !a.cancel) return null;
    return (
      <div className="flex flex-wrap gap-2">
        {a.next && <Button size={size} className="min-h-11" disabled={busyOrderId !== null} variant={a.next === 'delivered' ? 'primary' : 'sun'} onClick={() => { void advance(o); }}>{busyOrderId === o.id ? 'Updating…' : STATUS[o.status].verb}</Button>}
        {a.cancel && <Button size={size} className="min-h-11" disabled={busyOrderId !== null} variant="danger" onClick={() => setCancelId(o.id)}>Cancel</Button>}
      </div>
    );
  }

  return (
    <>
      <PageHeader
        title="Orders"
        subtitle={farmId ? 'Pack what is new, send out what is packed. Customers see every change in their app.' : 'Every farm’s part of every order, newest first.'}
        actions={can(me.role, 'orders.view', me.permissions) ? (
          <Button icon={<Plus size={20} />} onClick={openAddOrder}>Add order</Button>
        ) : undefined}
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
              className={cn('flex min-h-10 items-center gap-2 rounded-full border-2 px-4 py-2 text-[15px] font-bold transition', active ? 'border-transparent text-white' : 'border-line bg-white text-ink-soft hover:border-sprout')}
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
                <button onClick={() => setOpenId(o.id)} className="flex min-h-14 -space-x-3 text-left" aria-label={`Open order ${o.code}`}>
                  {o.items.slice(0, 3).map((it) => {
                    const p = byId.get(it.productId);
                    return <SmartImage key={it.productId} src={p?.image} alt={p?.name ?? 'Item'} emoji={p?.emoji} className="h-14 w-14 rounded-2xl text-xl ring-2 ring-white" />;
                  })}
                </button>
                <button onClick={() => setOpenId(o.id)} className="min-w-0 text-left">
                  <p className="break-words font-display text-lg font-extrabold">{o.code}{!farmId && <span className="ml-2 text-[15px] font-semibold text-leaf">{farmName.get(o.supplierId)}</span>}</p>
                  <p className="truncate text-ink-soft">{customerLabel(o, me.role, me.roleScope)} · {o.area} · {o.mode === 'wholesale' ? 'Wholesale' : 'Retail'}</p>
                  <p className="text-sm text-ink-mute">{timeAgo(o.placedAt)}</p>
                </button>
                <p className="hidden text-ink-soft md:block">{o.items.length} item{o.items.length === 1 ? '' : 's'}: {o.items.map((it) => byId.get(it.productId)?.name).filter(Boolean).slice(0, 2).join(', ')}{o.items.length > 2 ? '…' : ''}</p>
                <div className="flex items-center justify-between gap-3 md:block md:text-right">
                  <p className="font-extrabold">{formatPrice(orderTotal(o))}</p>
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
            <div className="flex flex-wrap items-center justify-between gap-2">
              <StatusPill status={open.status} />
              <p className="break-words text-right text-ink-mute">{timeAgo(open.placedAt)}</p>
            </div>
            <div className="overflow-x-auto rounded-3xl bg-white p-5 shadow-soft"><div className="min-w-[288px]"><Pipeline status={open.status} /></div></div>

            <div className="grid grid-cols-1 gap-3 text-[15px] min-[400px]:grid-cols-2">
              <div className="rounded-2xl bg-white p-4"><p className="text-ink-mute">Customer</p><p className="font-bold">{customerLabel(open, me.role, me.roleScope)}</p></div>
              <div className="rounded-2xl bg-white p-4"><p className="text-ink-mute">Delivery area</p><p className="font-bold">{open.area}</p></div>
              <div className="rounded-2xl bg-white p-4"><p className="text-ink-mute">Phone</p><p className={cn('font-bold', isFarmRole(me.role, me.roleScope) && 'text-ink-mute')}>{customerPhone(open, me.role, me.roleScope)}</p></div>
              <div className="rounded-2xl bg-white p-4"><p className="text-ink-mute">Shopping mode</p><p className="font-bold">{open.mode === 'wholesale' ? 'Wholesale' : 'Retail'}</p></div>
              <div className="rounded-2xl bg-white p-4"><p className="text-ink-mute">Delivery timeframe</p><p className="font-bold">{open.deliveryWindow === 'morning' ? 'Morning (07:00–10:00)' : open.deliveryWindow === 'evening' ? 'Evening (15:00–18:00)' : `Within ${open.deliveryWindow ?? '24h'}`}</p></div>
              <div className="rounded-2xl bg-white p-4"><p className="text-ink-mute">Payment</p><p className="font-bold">{open.paymentMethod === 'cash_on_delivery' ? 'Payment on delivery' : 'Paid online'}</p></div>
            </div>

            {isFarmRole(me.role, me.roleScope) && (
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
                        <p className="text-sm text-ink-mute">{formatNum(it.qty)} {p?.unit} at {formatPrice(it.unitPrice)}</p>
                      </div>
                      <p className="break-words text-right font-extrabold">{formatPrice(it.qty * it.unitPrice)}</p>
                    </li>
                  );
                })}
                <li className="flex items-center justify-between py-3 font-display text-lg font-extrabold">
                  <span>Total</span><span>{formatPrice(orderTotal(open))}</span>
                </li>
              </ul>
            </div>
            <ActionButtons o={open} size="md" />
          </div>
        )}
      </Drawer>

      <Modal open={addingOrder} onClose={() => { if (!savingOrder) setAddingOrder(false); }} title="Add order" wide>
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Customer name"><Input value={customerName} onChange={(event) => setCustomerName(event.target.value)} placeholder="Full name" /></Field>
            <Field label="Customer email"><Input type="email" value={customerEmail} onChange={(event) => setCustomerEmail(event.target.value)} placeholder="customer@example.com" /></Field>
            <Field label="Customer phone"><Input value={customerPhoneInput} onChange={(event) => setCustomerPhoneInput(event.target.value)} placeholder="+255..." /></Field>
            <Field label="Delivery timeframe">
              <Select value={deliveryWindow} onChange={(event) => setDeliveryWindow(event.target.value)}>
                <option value="morning">Morning (07:00–10:00)</option>
                <option value="evening">Evening (15:00–18:00)</option>
                <option value="12h">Within 12 hours</option>
                <option value="24h">Within 24 hours</option>
                <option value="48h">Within 48 hours</option>
                <option value="72h">Within 72 hours</option>
                <option value="7d">Within 7 days</option>
              </Select>
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Recipient name (optional)"><Input value={recipientName} onChange={(event) => setRecipientName(event.target.value)} placeholder="Name" /></Field>
            <Field label="Recipient phone (optional)"><Input value={recipientPhone} onChange={(event) => setRecipientPhone(event.target.value)} placeholder="+255..." /></Field>
          </div>
          <Field label="Delivery address (optional)"><Input value={deliveryAddress} onChange={(event) => setDeliveryAddress(event.target.value)} placeholder="Street, area or landmark" /></Field>

          <div>
            <Field label="Choose products" hint="Search live database products, then set the quantity">
              <div className="relative">
                <Search size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-mute" />
                <Input value={orderQuery} onChange={(event) => setOrderQuery(event.target.value)} placeholder="Search product or category" className="pl-10" />
              </div>
            </Field>
            <div className="mt-3 max-h-72 space-y-2 overflow-y-auto rounded-2xl border border-line bg-milk p-2">
              {orderProductOptions.length === 0 ? (
                <p className="p-5 text-center text-sm text-ink-mute">No available products match your search.</p>
              ) : orderProductOptions.map((product) => {
                const qty = orderItems[product.id] ?? 0;
                return (
                  <div key={product.id} className={cn('flex items-center gap-3 rounded-xl border p-2 transition', qty > 0 ? 'border-leaf bg-leaf-soft' : 'border-transparent bg-white')}>
                    <SmartImage src={product.image} alt={product.name} emoji={product.emoji} className="h-12 w-12 shrink-0 rounded-xl" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-extrabold">{product.name}</p>
                      <p className="text-sm text-ink-mute">{formatNum(product.stock)} {product.unit} available · {farmName.get(product.supplierId)}</p>
                    </div>
                    <Input
                      type="number"
                      min={0}
                      max={Math.min(10000, product.stock)}
                      step="any"
                      value={qty || ''}
                      placeholder="Qty"
                      onChange={(event) => setOrderItems((current) => ({
                        ...current,
                        [product.id]: Math.max(0, Math.min(Number(event.target.value) || 0, Math.min(10000, product.stock))),
                      }))}
                      className="w-24 shrink-0 text-center"
                      aria-label={`Quantity for ${product.name}`}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:justify-end">
            <Button variant="ghost" disabled={savingOrder} onClick={() => setAddingOrder(false)}>Cancel</Button>
            <Button disabled={savingOrder} onClick={() => void saveNewOrder()}>
              {savingOrder ? 'Adding order…' : 'Create order'}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={!!cancelling} onClose={() => { if (!busyOrderId) setCancelId(null); }} title="Cancel this order?">
        {cancelling && (
          <div className="space-y-4">
            <p className="text-lg text-ink-soft">
              Order <b className="text-ink">{cancelling.code}</b> will be cancelled and the customer is told. The items go back into your stock.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <Button variant="ghost" disabled={busyOrderId !== null} onClick={() => setCancelId(null)}>Keep order</Button>
              <Button variant="danger" disabled={busyOrderId !== null} onClick={() => { void cancelOrder(); }}>{busyOrderId ? 'Cancelling…' : 'Yes, cancel it'}</Button>
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
