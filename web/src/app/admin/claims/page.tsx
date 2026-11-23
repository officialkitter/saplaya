'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Ban, CheckCircle2, Clock3, Download, DoorOpen, PackageCheck, RefreshCw, Search, ShoppingBag, Truck, Upload } from 'lucide-react';
import { Guarded, PageHeader, Panel } from '@/components/admin/Guard';
import { Button } from '@/components/ui/Button';
import { fetchAdmin } from '@/lib/supabase';
import { useToast } from '@/lib/store';
import { userFacingMessage } from '@/lib/user-facing-error';
import { SmartImage } from '@/components/ui/SmartImage';
import { useGlobalMarket } from '@/lib/global-market';
import { claimMatchesFilters, ordersMatchingProducts } from '@/lib/claims';

type ClaimOrder = {
  id: string;
  code: string;
  supplier_name: string;
  status: 'pending' | 'packing' | 'en_route' | 'delivered' | 'cancelled' | string;
  claimed_at?: string;
  updated_at: string;
  items?: { name: string; image_url: string | null; qty: number; unit_price: number }[];
  item_count?: number;
  basket_total?: number;
};

const statusStyle: Record<string, { label: string; className: string }> = {
  pending: { label: 'Available', className: 'bg-sun-soft text-sun-deep' },
  packing: { label: 'Packing', className: 'bg-[#FFF4D6] text-[#8A5A00]' },
  en_route: { label: 'On the way', className: 'bg-[#E8F0FF] text-[#2457A7]' },
  delivered: { label: 'Delivered', className: 'bg-leaf-soft text-leaf-deep' },
  cancelled: { label: 'Cancelled', className: 'bg-red-50 text-red-700' },
};

const statusAccent: Record<string, string> = {
  pending: '#FFB300',
  packing: '#0288D1',
  en_route: '#7B1FA2',
  delivered: '#2E7D32',
  cancelled: '#D32F2F',
};

const CLAIM_FLOW = [
  { status: 'pending', label: 'Available', icon: Clock3, color: '#FFB300' },
  { status: 'packing', label: 'Packing', icon: ShoppingBag, color: '#0288D1' },
  { status: 'en_route', label: 'On the way', icon: Truck, color: '#7B1FA2' },
  { status: 'delivered', label: 'Delivered', icon: DoorOpen, color: '#2E7D32' },
] as const;

function ClaimFlow({ status }: { status: string }) {
  if (status === 'cancelled') {
    return (
      <div className="flex items-center gap-2 rounded-2xl bg-red-50 px-3 py-2 text-sm font-extrabold text-red-700">
        <Ban size={18} /> Cancelled
      </div>
    );
  }
  const current = CLAIM_FLOW.findIndex((step) => step.status === status);
  const activeIndex = current >= 0 ? current : 0;
  return (
    <div className="flex w-full items-center overflow-hidden" aria-label={`Claim flow: ${CLAIM_FLOW[activeIndex].label}`}>
      {CLAIM_FLOW.map((step, index) => {
        const reached = index <= activeIndex;
        const Icon = step.icon;
        return (
          <div key={step.status} className="flex flex-1 items-center last:flex-none">
            <motion.div
              initial={false}
              animate={{
                scale: index === activeIndex ? 1.08 : 1,
                backgroundColor: reached ? step.color : '#FFFFFF',
                borderColor: reached ? step.color : '#E3EBE0',
                color: reached ? '#FFFFFF' : '#6B7A6C',
              }}
              className="relative z-10 grid h-9 w-9 shrink-0 place-items-center rounded-full border-2"
              title={step.label}
            >
              <Icon size={17} />
            </motion.div>
            {index < CLAIM_FLOW.length - 1 && (
              <div className="mx-[-2px] h-1 flex-1 overflow-hidden rounded-full bg-line">
                <motion.div
                  initial={false}
                  animate={{
                    width: index < activeIndex ? '100%' : '0%',
                    backgroundColor: CLAIM_FLOW[index + 1].color,
                  }}
                  transition={{ duration: 0.55 }}
                  className="h-full"
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Claims() {
  const push = useToast((state) => state.push);
  const { formatPrice } = useGlobalMarket();
  const [available, setAvailable] = useState<ClaimOrder[]>([]);
  const [mine, setMine] = useState<ClaimOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [view, setView] = useState<'available' | 'ongoing' | 'history'>('available');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const busyRef = useRef<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const reload = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const [availableRows, mineRows] = await Promise.all([
        fetchAdmin<ClaimOrder[]>('/admin/claims/available'),
        fetchAdmin<ClaimOrder[]>('/admin/claims/my'),
      ]);
      setAvailable(availableRows);
      setMine(mineRows);
      setLastRefresh(new Date());
    } catch (error) {
      push(userFacingMessage(error, 'Could not load orders.'), 'bad');
    } finally {
      if (!silent) setLoading(false);
      setRefreshing(false);
    }
  }, [push]);

  useEffect(() => {
    void reload();
    const interval = window.setInterval(() => void reload(true), 10000);
    const refreshOnVisible = () => {
      if (document.visibilityState === 'visible') void reload(true);
    };
    document.addEventListener('visibilitychange', refreshOnVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', refreshOnVisible);
    };
  }, [reload]);

  const ongoing = useMemo(() => mine.filter((order) => ['pending', 'packing', 'en_route'].includes(order.status)), [mine]);
  const history = useMemo(() => mine.filter((order) => ['delivered', 'cancelled'].includes(order.status)), [mine]);
  const productOptions = useMemo(() => {
    const products = new Map<string, { name: string; image_url: string | null }>();
    available.forEach((order) => order.items?.forEach((item) => {
      if (!products.has(item.name)) products.set(item.name, item);
    }));
    return [...products.values()].sort((left, right) => left.name.localeCompare(right.name));
  }, [available]);
  const baseVisible = view === 'available' ? available : view === 'ongoing' ? ongoing : history;
  const visible = useMemo(() => {
    return baseVisible.filter((order) => claimMatchesFilters(order, query, selectedProducts));
  }, [baseVisible, query, selectedProducts]);

  async function claim(order: ClaimOrder) {
    if (busyRef.current) return;
    busyRef.current = order.id;
    setBusyId(order.id);
    try {
      await fetchAdmin(`/admin/claims/${encodeURIComponent(order.id)}/claim`, { method: 'POST' });
      push(`Order ${order.code} is now yours.`);
      setView('ongoing');
      await reload();
    } catch (error) {
      push(userFacingMessage(error, 'Could not claim this order.'), 'bad');
    } finally {
      busyRef.current = null;
      setBusyId(null);
    }
  }

  async function release(order: ClaimOrder) {
    if (busyRef.current) return;
    busyRef.current = order.id;
    setBusyId(order.id);
    try {
      await fetchAdmin(`/admin/claims/${encodeURIComponent(order.id)}/release`, { method: 'POST' });
      push(`Order ${order.code} was released.`);
      await reload();
    } catch (error) {
      push(userFacingMessage(error, 'Could not release this claim.'), 'bad');
    } finally {
      busyRef.current = null;
      setBusyId(null);
    }
  }

    async function claimSelected() {
      if (!selected.size || busyRef.current) return;
      busyRef.current = 'bulk';
      setBusyId('bulk');
      try {
        const result = await fetchAdmin<{ claimed: number; skipped: number; failures: { ref: string; reason: string }[] }>('/admin/claims/bulk', {
          method: 'POST',
          body: JSON.stringify({ refs: [...selected].map((id) => available.find((order) => order.id === id)?.code ?? id) }),
        });
        push(`${result.claimed} order${result.claimed === 1 ? '' : 's'} claimed.`);
        setSelected(new Set());
        setView('ongoing');
        await reload();
      } catch (error) {
        push(userFacingMessage(error, 'Could not claim selected orders.'), 'bad');
      } finally {
        busyRef.current = null;
        setBusyId(null);
      }
    }

    async function importOrders(file: File | undefined) {
      if (!file) return;
      setImporting(true);
      try {
        const text = await file.text();
        const rows = text.split(/\r?\n/).map((line) => line
          .split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/)
          .map((value) => value.replace(/^"|"$/g, '').replace(/""/g, '"').trim()));
        const refs = rows.flatMap((row) => row
          .filter((value) => /^[0-9a-f-]{8,36}$/i.test(value)));
        if (!refs.length) throw new Error('No order references found.');
        const result = await fetchAdmin<{ claimed: number; skipped: number; failures: { ref: string; reason: string }[] }>('/admin/claims/bulk', {
          method: 'POST',
          body: JSON.stringify({ refs }),
        });
        push(`${result.claimed} order${result.claimed === 1 ? '' : 's'} claimed; ${result.skipped} already claimed or unavailable.`);
        setView('ongoing');
        await reload();
      } catch (error) {
        push(userFacingMessage(error, 'Could not import orders.'), 'bad');
      } finally {
        setImporting(false);
      }
    }

    async function exportClaims() {
      try {
        const escapeCell = (value: unknown) => String(value ?? '')
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');
        const rows = [
          ['Order', 'Farm', 'Status', 'Items', 'Total', 'Claimed At', 'Updated At'],
          ...mine.map((order) => [
            order.code,
            order.supplier_name,
            statusStyle[order.status]?.label ?? order.status,
            order.item_count ?? 0,
            order.basket_total ?? 0,
            order.claimed_at ?? '',
            order.updated_at,
          ]),
        ];
        const table = `<table><thead><tr>${rows[0].map((cell) => `<th>${escapeCell(cell)}</th>`).join('')}</tr></thead><tbody>${rows.slice(1).map((row) => `<tr>${row.map((cell) => `<td>${escapeCell(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
        const blob = new Blob([`<html><body>${table}</body></html>`], { type: 'application/vnd.ms-excel' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `saplaya-claims-${new Date().toISOString().slice(0, 10)}.xls`;
        link.click();
        URL.revokeObjectURL(url);
      } catch (error) {
        push(userFacingMessage(error, 'Could not export claims.'), 'bad');
      }
    }

  function toggleProduct(name: string) {
    setSelectedProducts((current) => {
      const next = new Set(current);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  function selectMatchingOrders() {
    if (!selectedProducts.size) return;
    setSelected(new Set(ordersMatchingProducts(available, selectedProducts).map((order) => order.id)));
  }

  const tabs = [
    { id: 'available' as const, label: 'Available', count: available.length, icon: Clock3 },
    { id: 'ongoing' as const, label: 'My ongoing', count: ongoing.length, icon: PackageCheck },
    { id: 'history' as const, label: 'Claim history', count: history.length, icon: CheckCircle2 },
  ];

  return (
    <>
      <PageHeader title="Order claims" subtitle="Claim an order in one tap, keep it moving, or release it if you cannot continue." />
      <div className="mb-5 flex flex-wrap gap-2">
        <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-line bg-white px-4 py-2.5 font-bold text-ink-soft">
          <Upload size={18} />
          {importing ? 'Importing…' : 'Import Excel / CSV'}
          <input
            type="file"
            accept=".csv,.xls"
            className="sr-only"
            disabled={importing}
            onChange={(event) => { void importOrders(event.target.files?.[0]); event.currentTarget.value = ''; }}
          />
        </label>
        <Button variant="soft" icon={<Download size={18} />} onClick={() => void exportClaims()}>Export Excel</Button>
        <Button
          variant="ghost"
          icon={<RefreshCw size={18} className={refreshing ? 'animate-spin' : ''} />}
          disabled={refreshing}
          onClick={() => void reload(true)}
        >
          {refreshing ? 'Refreshing…' : 'Refresh now'}
        </Button>
        {lastRefresh && (
          <span className="ml-auto self-center text-xs font-semibold text-ink-mute">
            Live · updated {lastRefresh.toLocaleTimeString()}
          </span>
        )}
      </div>
      <div className="mb-5 grid gap-2 sm:grid-cols-3">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = view === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setView(tab.id)}
              className={`flex min-h-14 items-center gap-3 rounded-2xl border px-4 py-3 text-left font-bold transition ${active ? 'border-leaf bg-leaf text-white shadow-soft' : 'border-line bg-white text-ink-soft hover:border-sprout'}`}
            >
              <Icon size={21} />
              <span className="flex-1">{tab.label}</span>
              <span className={`rounded-full px-2.5 py-1 text-sm ${active ? 'bg-white/20' : 'bg-leaf-soft text-leaf-deep'}`}>{tab.count}</span>
            </button>
          );
        })}
      </div>
      {view === 'available' && (
        <div className="mb-5 space-y-3 rounded-[1.75rem] border border-line bg-white p-4 shadow-soft sm:p-5">
          <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <div className="relative">
              <Search size={20} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-mute" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search orders, farms or products"
                aria-label="Search claims"
                className="h-12 w-full rounded-2xl border border-line bg-milk pl-12 pr-4 font-semibold outline-none transition focus:border-leaf focus:ring-2 focus:ring-leaf/15"
              />
            </div>
            <Button
              variant="soft"
              disabled={!selectedProducts.size || busyId !== null}
              onClick={selectMatchingOrders}
            >
              Select matching orders
            </Button>
          </div>
          {productOptions.length > 0 && (
            <div className="overflow-x-auto pb-1">
              <div className="flex min-w-max gap-2">
                {productOptions.map((product) => {
                  const active = selectedProducts.has(product.name);
                  return (
                    <motion.button
                      layout
                      key={product.name}
                      type="button"
                      aria-pressed={active}
                      onClick={() => toggleProduct(product.name)}
                      className={`flex min-h-12 items-center gap-2 rounded-2xl border px-3 py-2 text-sm font-extrabold transition ${active ? 'border-leaf bg-leaf text-white shadow-soft' : 'border-line bg-milk text-ink-soft hover:border-sprout'}`}
                    >
                      <SmartImage src={product.image_url ?? ''} alt={product.name} className="h-9 w-9 shrink-0 rounded-xl" />
                      {product.name}
                    </motion.button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
      <Panel title={view === 'available' ? 'Available for claim' : view === 'ongoing' ? 'Ongoing claims' : 'Claims history'} subtitle="Every action is visible in one place.">
        {view === 'available' && available.length > 0 && (
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-milk p-3">
            <label className="flex items-center gap-2 font-bold">
              <input
                type="checkbox"
                checked={visible.length > 0 && visible.every((order) => selected.has(order.id))}
                onChange={(event) => setSelected(event.target.checked ? new Set(visible.map((order) => order.id)) : new Set())}
              />
              Select all
            </label>
            <Button disabled={!selected.size || busyId !== null} onClick={() => void claimSelected()}>
              {busyId === 'bulk' ? 'Claiming…' : `Claim selected (${selected.size})`}
            </Button>
          </div>
        )}
        {loading ? (
          <p role="status" className="py-8 text-center text-ink-mute">Loading claims…</p>
        ) : visible.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line py-12 text-center">
            <Ban className="mx-auto text-ink-mute" size={32} />
            <p className="mt-3 font-bold">{view === 'available' ? 'No orders available right now' : 'No orders in this section'}</p>
          </div>
        ) : (
          <ul className="space-y-3">
            {visible.map((order, index) => {
              const status = statusStyle[order.status] ?? { label: order.status, className: 'bg-leaf-soft text-leaf-deep' };
              const accent = statusAccent[order.status] ?? '#2E7D32';
              return (
                <motion.li
                  layout
                  initial={{ opacity: 0, x: 18 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: Math.min(index, 8) * 0.035 }}
                  key={order.id}
                  className="grid items-stretch overflow-hidden rounded-[1.5rem] border border-line bg-white shadow-soft md:grid-cols-[56px_180px_1fr_150px_160px]"
                  style={{ borderLeft: `6px solid ${accent}` }}
                >
                  {view === 'available' ? (
                    <label className="flex min-h-16 items-center justify-center bg-milk/70 px-3">
                      <input
                        type="checkbox"
                        checked={selected.has(order.id)}
                        onChange={(event) => {
                          setSelected((current) => {
                            const next = new Set(current);
                            if (event.target.checked) next.add(order.id);
                            else next.delete(order.id);
                            return next;
                          });
                        }}
                        aria-label={`Select order ${order.code}`}
                        className="h-5 w-5 accent-leaf"
                      />
                    </label>
                  ) : <div className="hidden md:block" />}
                  <div className="flex min-h-16 items-center border-b border-line px-4 py-3 md:border-b-0 md:border-r">
                    <div>
                      <p className="font-display text-lg font-extrabold">{order.code}</p>
                      <p className="truncate text-sm text-ink-soft">{order.supplier_name}</p>
                    </div>
                  </div>
                  <div className="flex min-h-16 items-center gap-3 border-b border-line px-4 py-3 md:border-b-0 md:border-r">
                    {order.items && order.items.length > 0 ? (
                      <>
                        <div className="flex -space-x-2" aria-label={`${order.item_count ?? 0} basket items`}>
                          {order.items.slice(0, 4).map((item, itemIndex) => (
                            <SmartImage
                              key={`${order.id}-${itemIndex}`}
                              src={item.image_url ?? ''}
                              alt={item.name}
                              className="h-12 w-12 rounded-xl ring-2 ring-white"
                            />
                          ))}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-extrabold text-ink">
                            {order.items.slice(0, 2).map((item) => item.name).join(', ')}
                            {order.items.length > 2 ? ` +${order.items.length - 2}` : ''}
                          </p>
                          <p className="mt-0.5 text-sm font-bold text-leaf-deep">
                            {order.item_count ?? 0} items · {formatPrice(order.basket_total ?? 0)}
                          </p>
                        </div>
                      </>
                    ) : (
                      <p className="text-sm text-ink-mute">No product details</p>
                    )}
                  </div>
                  <div className="flex min-h-16 items-center px-4 py-3 md:border-r">
                    <div>
                      <span className={`inline-flex rounded-full px-3 py-1.5 text-sm font-extrabold ${status.className}`}>{status.label}</span>
                      {order.claimed_at && <p className="mt-1 text-xs text-ink-mute">Claimed {new Date(order.claimed_at).toLocaleString()}</p>}
                    </div>
                  </div>
                  <div className="flex min-h-16 items-center justify-end px-4 py-3">
                    {view === 'available' ? (
                      <Button className="w-full" disabled={busyId !== null} onClick={() => void claim(order)}>{busyId === order.id ? 'Claiming…' : 'Claim order'}</Button>
                    ) : view === 'ongoing' ? (
                      <Button className="w-full" variant="danger" disabled={busyId !== null} onClick={() => void release(order)}>{busyId === order.id ? 'Releasing…' : 'Release claim'}</Button>
                    ) : null}
                  </div>
                  {view !== 'available' && (
                    <div className="col-span-full border-t border-line bg-milk/60 px-4 py-3">
                      <div className="mx-auto flex max-w-xl items-center justify-center">
                        <ClaimFlow status={order.status} />
                      </div>
                    </div>
                  )}
                </motion.li>
              );
            })}
          </ul>
        )}
      </Panel>
    </>
  );
}

export default function ClaimsPage() {
  return (
    <Guarded perm="claims.view">
      <Claims />
    </Guarded>
  );
}
