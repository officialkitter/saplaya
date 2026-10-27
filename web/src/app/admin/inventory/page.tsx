'use client';

import { motion } from 'framer-motion';
import { ArrowDownRight, ArrowUpRight, History, PackagePlus, RotateCcw } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Guarded, PageHeader, Panel } from '@/components/admin/Guard';
import { RestockModal } from '@/components/admin/RestockModal';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/Bits';
import { Select } from '@/components/ui/Fields';
import { SmartImage } from '@/components/ui/SmartImage';
import { cn, formatNum, timeAgo } from '@/lib/format';
import { can } from '@/lib/roles';
import { isLow, stockFlowByDay } from '@/lib/stats';
import { useScope } from '@/lib/store';
import type { MovementKind } from '@/lib/types';

const KIND: Record<MovementKind, { label: string; chip: string }> = {
  sale: { label: 'Sold', chip: 'bg-[#E1F5FE] text-[#01579B]' },
  restock: { label: 'Stock added', chip: 'bg-leaf-soft text-leaf-deep' },
  cancel_return: { label: 'Returned (cancelled)', chip: 'bg-[#FFEBEE] text-[#B71C1C]' },
  adjustment: { label: 'Opening stock', chip: 'bg-sun-soft text-[#8A5A00]' },
};

const TABS: { id: MovementKind | 'all'; label: string }[] = [
  { id: 'all', label: 'Everything' },
  { id: 'sale', label: 'Sold' },
  { id: 'restock', label: 'Stock added' },
  { id: 'cancel_return', label: 'Returned' },
];

const AXIS = { fontSize: 12, fill: '#6B7A6C' };

function Inventory() {
  const { me, farmId, suppliers, products, movements } = useScope();
  const [tab, setTab] = useState<MovementKind | 'all'>('all');
  const [product, setProduct] = useState('all');
  const [farm, setFarm] = useState('all');
  const [limit, setLimit] = useState(20);
  const [restock, setRestock] = useState(false);

  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const farmName = useMemo(() => new Map(suppliers.map((s) => [s.id, s.name])), [suppliers]);
  const flowSource = useMemo(() => (farm === 'all' ? movements : movements.filter((m) => m.supplierId === farm)), [movements, farm]);
  const flow = useMemo(() => stockFlowByDay(flowSource, 14), [flowSource]);
  const rows = useMemo(
    () => flowSource.filter((m) => (tab === 'all' || m.kind === tab) && (product === 'all' || m.productId === product)),
    [flowSource, tab, product]
  );
  const productOptions = useMemo(() => products.filter((p) => farm === 'all' || p.supplierId === farm), [products, farm]);

  if (!me) return null;
  const canStock = can(me.role, 'stock.adjust');
  const sold = flow.reduce((n, d) => n + d.sold, 0);
  const added = flow.reduce((n, d) => n + d.added, 0);
  const lowCount = products.filter((p) => isLow(p) && (farm === 'all' || p.supplierId === farm)).length;

  return (
    <>
      <PageHeader
        title="Stock history"
        subtitle="Every kilo that comes in or goes out is written down here, so the numbers always add up."
        actions={canStock ? <Button icon={<PackagePlus size={20} />} onClick={() => setRestock(true)}>Add stock</Button> : undefined}
      />

      <section className="mb-6 grid grid-cols-3 divide-x divide-line rounded-[1.75rem] border border-line bg-white shadow-soft">
        <div className="p-5"><p className="text-[15px] font-semibold text-ink-mute">Sold, 14 days</p><p className="mt-1 font-display text-3xl font-extrabold">{formatNum(sold)}</p></div>
        <div className="p-5"><p className="text-[15px] font-semibold text-ink-mute">Added, 14 days</p><p className="mt-1 font-display text-3xl font-extrabold text-leaf">{formatNum(added)}</p></div>
        <div className="p-5"><p className="text-[15px] font-semibold text-ink-mute">Running low</p><p className={cn('mt-1 font-display text-3xl font-extrabold', lowCount > 0 && 'text-[#C27C00]')}>{lowCount}</p></div>
      </section>

      <Panel title="Stock in and out" subtitle="Units sold and units added each day" className="mb-6">
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={flow} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={2}>
              <CartesianGrid stroke="#E3EBE0" strokeDasharray="3 6" vertical={false} />
              <XAxis dataKey="day" tick={AXIS} tickLine={false} axisLine={false} interval={1} />
              <YAxis tick={AXIS} tickLine={false} axisLine={false} width={40} />
              <Tooltip cursor={{ fill: '#E8F5E9' }} contentStyle={{ borderRadius: 14, border: '1px solid #E3EBE0', fontWeight: 600 }} />
              <Legend iconType="circle" wrapperStyle={{ fontWeight: 600, fontSize: 14 }} />
              <Bar dataKey="sold" name="Sold" fill="#2E7D32" radius={[8, 8, 0, 0]} animationDuration={900} />
              <Bar dataKey="added" name="Added" fill="#FFB300" radius={[8, 8, 0, 0]} animationDuration={900} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Type of change">
          {TABS.map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => { setTab(t.id); setLimit(20); }} className={cn('rounded-full border-2 px-4 py-2 text-[15px] font-bold transition', tab === t.id ? 'border-leaf bg-leaf text-white' : 'border-line bg-white text-ink-soft hover:border-sprout')}>
              {t.label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          {!farmId && (
            <div className="w-52"><Select value={farm} onChange={(e) => { setFarm(e.target.value); setProduct('all'); }} aria-label="Filter by farm"><option value="all">All farms</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></div>
          )}
          <div className="w-52"><Select value={product} onChange={(e) => setProduct(e.target.value)} aria-label="Filter by product"><option value="all">All products</option>{productOptions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></div>
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={<History size={36} />} title="Nothing here yet" hint="Sales and stock changes will be listed here as they happen." />
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-[1.75rem] border border-line bg-white shadow-soft">
          {rows.slice(0, limit).map((m, i) => {
            const p = byId.get(m.productId);
            const plus = m.qtyChange > 0;
            return (
              <motion.li key={m.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: Math.min(i, 10) * 0.02 }} className="flex flex-wrap items-center gap-x-4 gap-y-1 p-4">
                <SmartImage src={p?.image} alt={p?.name ?? 'Item'} emoji={p?.emoji} className="h-12 w-12 shrink-0 rounded-2xl text-lg" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold">{p?.name ?? 'Item'}{!farmId && <span className="font-medium text-ink-mute"> · {farmName.get(m.supplierId)}</span>}</p>
                  <p className="text-sm text-ink-mute">{timeAgo(m.at)}{m.orderCode ? ` · order ${m.orderCode}` : ''}{m.by ? ` · ${m.by}` : ''}</p>
                </div>
                <span className={cn('hidden rounded-full px-3 py-1 text-sm font-bold sm:inline-block', KIND[m.kind].chip)}>{KIND[m.kind].label}</span>
                <div className="text-right">
                  <p className={cn('inline-flex items-center gap-1 font-display text-lg font-extrabold', plus ? 'text-leaf' : 'text-[#0277BD]')}>
                    {m.kind === 'cancel_return' ? <RotateCcw size={16} /> : plus ? <ArrowUpRight size={18} /> : <ArrowDownRight size={18} />}
                    {plus ? '+' : ''}{formatNum(m.qtyChange)} {p?.unit}
                  </p>
                  <p className="text-sm text-ink-mute">{formatNum(m.stockAfter)} left</p>
                </div>
              </motion.li>
            );
          })}
        </ul>
      )}
      {rows.length > limit && <div className="mt-5 text-center"><Button variant="soft" onClick={() => setLimit((l) => l + 20)}>Show more</Button></div>}

      <RestockModal open={restock} onClose={() => setRestock(false)} products={products.filter((p) => p.active)} />
    </>
  );
}

export default function InventoryPage() {
  return (
    <Guarded perm="inventory.view">
      <Inventory />
    </Guarded>
  );
}
