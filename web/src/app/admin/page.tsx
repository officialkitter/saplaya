'use client';

import { motion } from 'framer-motion';
import { AlertTriangle, ArrowRight, ClipboardList, Sprout, TrendingDown, TrendingUp } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { Guarded, Panel } from '@/components/admin/Guard';
import { RestockModal } from '@/components/admin/RestockModal';
import { Button, LinkButton } from '@/components/ui/Button';
import { CountUp, StatusPill } from '@/components/ui/Bits';
import { SmartImage } from '@/components/ui/SmartImage';
import { formatNum, formatTZS, STATUS, timeAgo, tanzaniaHour } from '@/lib/format';
import { photoUrl } from '@/lib/images';
import { can } from '@/lib/roles';
import { customerLabel, isLow, modeSplitByDay, orderTotal, ordersByArea, ordersByHour, salesByCategory, salesByDay, salesByFarm, statusCounts, topProducts, weekChange, countsAsSale } from '@/lib/stats';
import { useDB, useScope } from '@/lib/store';

const AXIS = { fontSize: 12, fill: '#6B7A6C' };
const TIP = { borderRadius: 14, border: '1px solid #E3EBE0', boxShadow: '0 10px 24px -12px rgba(27,94,32,.35)', fontWeight: 600 } as const;

function greeting() {
  const h = tanzaniaHour();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

function Dashboard() {
  const { me, farmId, suppliers, products, orders } = useScope();
  const applications = useDB((s) => s.applications);
  const [restockFor, setRestockFor] = useState<string | null>(null);

  const platform = !farmId;
  const sales = useMemo(() => salesByDay(orders, 14), [orders]);
  const total14 = useMemo(() => orders.filter(countsAsSale).reduce((n, o) => n + orderTotal(o), 0), [orders]);
  const change = useMemo(() => weekChange(orders), [orders]);
  const statuses = useMemo(() => statusCounts(orders), [orders]);
  const top = useMemo(() => topProducts(orders, products, 6), [orders, products]);
  const byFarm = useMemo(() => salesByFarm(orders, suppliers), [orders, suppliers]);
  const low = useMemo(() => products.filter(isLow).sort((a, b) => a.stock / a.lowStockAt - b.stock / b.lowStockAt), [products]);
  const delivered = orders.filter((o) => o.status === 'delivered').length;
  const done = orders.filter((o) => o.status !== 'cancelled').length;
  const avg = done ? total14 / done : 0;
  const pending = orders.filter((o) => o.status === 'pending').length;
  const newApps = applications.filter((a) => a.status === 'new').length;
  const photoByProduct = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const hours = useMemo(() => ordersByHour(orders), [orders]);
  const peakHour = useMemo(() => hours.reduce((a, b) => (b.count > a.count ? b : a), hours[0]), [hours]);
  const categories = useMemo(() => salesByCategory(orders, products), [orders, products]);
  const areas = useMemo(() => ordersByArea(orders), [orders]);
  const split = useMemo(() => modeSplitByDay(orders, 14), [orders]);

  if (!me) return null;
  const first = me.name.split(' ')[0];
  const canRestock = can(me.role, 'stock.adjust');

  const todo: string[] = [];
  if (pending > 0) todo.push(`${pending} new order${pending === 1 ? '' : 's'} waiting to be packed`);
  if (low.length > 0) todo.push(`${low.length} product${low.length === 1 ? ' is' : 's are'} running low`);
  if (platform && newApps > 0) todo.push(`${newApps} farm application${newApps === 1 ? '' : 's'} to review`);

  const restockProducts = products.filter((p) => p.active);

  return (
    <div className="space-y-6">
      {/* Today band */}
      <motion.section initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="field-lines relative overflow-hidden rounded-[2rem] bg-leaf p-6 text-white sm:p-8">
        <div className="relative grid items-center gap-6 md:grid-cols-[1fr_auto]">
          <div>
            <h1 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">{greeting()}, {first}.</h1>
            <p className="mt-2 max-w-xl text-lg text-white/90">
              {todo.length === 0 ? 'Everything is up to date. Nothing needs your attention right now.' : `Today: ${todo.join(', ')}.`}
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              {pending > 0 && <LinkButton href="/admin/orders#pending" variant="sun" icon={<ClipboardList size={20} />}>Open new orders</LinkButton>}
              {platform && newApps > 0 && <LinkButton href="/admin/suppliers#applications" variant="sun" icon={<Sprout size={20} />}>Review farms</LinkButton>}
              {canRestock && low.length > 0 && <Button variant="soft" onClick={() => setRestockFor(low[0].id)} icon={<AlertTriangle size={20} />}>Add stock</Button>}
              {todo.length === 0 && <LinkButton href="/admin/orders" variant="sun">See all orders</LinkButton>}
            </div>
          </div>
          <SmartImage src={photoUrl('farm', 700)} alt="A green field" emoji="🌾" className="hidden h-36 w-56 rounded-3xl ring-4 ring-white/30 md:block" />
        </div>
      </motion.section>

      {/* One strip, not four cards */}
      <section className="grid grid-cols-2 divide-line rounded-[1.75rem] border border-line bg-white shadow-soft lg:grid-cols-4 lg:divide-x">
        <div className="p-5">
          <p className="text-[15px] font-semibold text-ink-mute">{platform ? 'Sales through Saplaya' : 'Your sales'}, 14 days</p>
          <p className="mt-1 font-display text-3xl font-extrabold"><CountUp value={total14} prefix="TSh " /></p>
          {change !== null && (
            <p className={`mt-1 inline-flex items-center gap-1 text-sm font-bold ${change >= 0 ? 'text-leaf' : 'text-[#C62828]'}`}>
              {change >= 0 ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
              {Math.abs(change)}% {change >= 0 ? 'more' : 'less'} than last week
            </p>
          )}
        </div>
        <div className="border-l border-line p-5 lg:border-l-0">
          <p className="text-[15px] font-semibold text-ink-mute">Orders</p>
          <p className="mt-1 font-display text-3xl font-extrabold"><CountUp value={orders.length} /></p>
          <p className="mt-1 text-sm text-ink-mute">{pending} waiting to be packed</p>
        </div>
        <div className="border-t border-line p-5 lg:border-t-0">
          <p className="text-[15px] font-semibold text-ink-mute">Delivered</p>
          <p className="mt-1 font-display text-3xl font-extrabold"><CountUp value={delivered} /></p>
          <p className="mt-1 text-sm text-ink-mute">{done ? Math.round((delivered / done) * 100) : 0}% of orders so far</p>
        </div>
        <div className="border-l border-t border-line p-5 lg:border-t-0">
          <p className="text-[15px] font-semibold text-ink-mute">Average order</p>
          <p className="mt-1 font-display text-3xl font-extrabold"><CountUp value={avg} prefix="TSh " /></p>
          <p className="mt-1 text-sm text-ink-mute">{platform ? `${suppliers.filter((s) => s.status === 'active').length} farms selling` : `${products.filter((p) => p.active).length} products in the shop`}</p>
        </div>
      </section>

      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <Panel title="Sales each day" subtitle="Money from orders that were not cancelled">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={sales} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="sales" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#4CAF50" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="#4CAF50" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#E3EBE0" strokeDasharray="3 6" vertical={false} />
                <XAxis dataKey="day" tick={AXIS} tickLine={false} axisLine={false} interval={1} />
                <YAxis tick={AXIS} tickLine={false} axisLine={false} width={48} tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))} />
                <Tooltip contentStyle={TIP} formatter={(v: unknown) => [formatTZS(Number(v)), 'Sales']} />
                <Area type="monotone" dataKey="sales" stroke="#2E7D32" strokeWidth={3} fill="url(#sales)" animationDuration={1200} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title="Orders right now" subtitle="Colours match the customer app">
          <div className="grid items-center gap-2 sm:grid-cols-[1fr_1fr] lg:grid-cols-1">
            <div className="relative mx-auto h-48 w-48">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={statuses.filter((s) => s.count > 0)} dataKey="count" nameKey="status" innerRadius={58} outerRadius={88} paddingAngle={3} stroke="none" animationDuration={1000}>
                    {statuses.filter((s) => s.count > 0).map((s) => <Cell key={s.status} fill={STATUS[s.status].color} />)}
                  </Pie>
                  <Tooltip contentStyle={TIP} formatter={(v: unknown, _n: unknown, item: { payload?: { status?: keyof typeof STATUS } }) => [String(v), item.payload?.status ? STATUS[item.payload.status].label : '']} />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
                <div>
                  <p className="font-display text-3xl font-extrabold leading-none">{orders.length}</p>
                  <p className="text-sm text-ink-mute">orders</p>
                </div>
              </div>
            </div>
            <ul className="space-y-2">
              {statuses.map((s) => (
                <li key={s.status} className="flex items-center gap-3 text-[15px]">
                  <span className="h-3.5 w-3.5 rounded-full" style={{ backgroundColor: STATUS[s.status].color }} />
                  <span className="flex-1 font-semibold">{STATUS[s.status].label}</span>
                  <span className="font-extrabold">{s.count}</span>
                </li>
              ))}
            </ul>
          </div>
        </Panel>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title={platform ? 'Which farms sell the most' : 'Your best sellers'} subtitle="Money earned in 14 days">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={platform ? byFarm : top} layout="vertical" margin={{ top: 0, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="#E3EBE0" strokeDasharray="3 6" horizontal={false} />
                <XAxis type="number" tick={AXIS} tickLine={false} axisLine={false} tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))} />
                <YAxis type="category" dataKey="name" width={118} tick={{ ...AXIS, fill: '#15261A', fontWeight: 600 }} tickLine={false} axisLine={false} />
                <Tooltip cursor={{ fill: '#E8F5E9' }} contentStyle={TIP} formatter={(v: unknown) => [formatTZS(Number(v)), 'Sales']} />
                <Bar dataKey="sales" fill="#4CAF50" radius={[0, 12, 12, 0]} barSize={22} animationDuration={1000} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title="Running low" subtitle="Add stock before these sell out" action={low.length > 0 ? <span className="rounded-full bg-sun-soft px-3 py-1 text-sm font-extrabold text-[#8A5A00]">{low.length}</span> : undefined}>
          {low.length === 0 ? (
            <p className="rounded-2xl bg-leaf-soft p-4 font-semibold text-leaf-deep">All products have enough stock.</p>
          ) : (
            <ul className="space-y-3">
              {low.slice(0, 5).map((p) => {
                const ratio = Math.min(1, p.stock / (p.lowStockAt * 2));
                const critical = p.stock <= p.lowStockAt / 2;
                return (
                  <li key={p.id} className="flex items-center gap-3">
                    <SmartImage src={p.image} alt={p.name} emoji={p.emoji} className="h-12 w-12 shrink-0 rounded-2xl text-lg" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="truncate font-bold">{p.name}</p>
                        <p className={`shrink-0 text-sm font-extrabold ${critical ? 'text-[#C62828]' : 'text-[#8A5A00]'}`}>{formatNum(p.stock)} {p.unit} left</p>
                      </div>
                      <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-line">
                        <motion.div initial={{ width: 0 }} animate={{ width: `${Math.max(6, ratio * 100)}%` }} transition={{ duration: 0.8 }} className="h-full rounded-full" style={{ backgroundColor: critical ? '#D32F2F' : '#FFB300' }} />
                      </div>
                    </div>
                    {canRestock && <Button size="sm" variant="soft" onClick={() => setRestockFor(p.id)}>Add stock</Button>}
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <Panel title="Retail and wholesale" subtitle="Who is buying each day">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={split} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="#E3EBE0" strokeDasharray="3 6" vertical={false} />
                <XAxis dataKey="day" tick={AXIS} tickLine={false} axisLine={false} interval={1} />
                <YAxis tick={AXIS} tickLine={false} axisLine={false} width={48} tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))} />
                <Tooltip cursor={{ fill: '#E8F5E9' }} contentStyle={TIP} formatter={(v: unknown, n: unknown) => [formatTZS(Number(v)), n === 'retail' ? 'Retail' : 'Wholesale']} />
                <Bar dataKey="retail" stackId="a" fill="#4CAF50" radius={[0, 0, 0, 0]} animationDuration={1000} />
                <Bar dataKey="wholesale" stackId="a" fill="#FFB300" radius={[8, 8, 0, 0]} animationDuration={1200} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 flex gap-4 text-sm font-semibold">
            <span className="inline-flex items-center gap-2"><i className="h-3 w-3 rounded-full bg-[#4CAF50]" />Retail</span>
            <span className="inline-flex items-center gap-2"><i className="h-3 w-3 rounded-full bg-[#FFB300]" />Wholesale</span>
          </div>
        </Panel>

        <Panel title="What sells" subtitle="Share of money by product type">
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={categories} dataKey="sales" nameKey="name" outerRadius={84} paddingAngle={2} stroke="none" animationDuration={1000}>
                  {categories.map((c, i) => <Cell key={c.name} fill={['#2E7D32', '#FFB300', '#4CAF50', '#8D6E63', '#26A69A'][i % 5]} />)}
                </Pie>
                <Tooltip contentStyle={TIP} formatter={(v: unknown) => [formatTZS(Number(v)), 'Sales']} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="mt-2 grid grid-cols-2 gap-1.5 text-sm font-semibold">
            {categories.map((c, i) => (
              <li key={c.name} className="flex items-center gap-2"><i className="h-3 w-3 rounded-full" style={{ backgroundColor: ['#2E7D32', '#FFB300', '#4CAF50', '#8D6E63', '#26A69A'][i % 5] }} />{c.name}</li>
            ))}
          </ul>
        </Panel>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Busiest hours" subtitle={peakHour && peakHour.count > 0 ? `Most orders come in around ${peakHour.hour}` : 'When customers order'}>
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={hours} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid stroke="#E3EBE0" strokeDasharray="3 6" vertical={false} />
                <XAxis dataKey="hour" tick={AXIS} tickLine={false} axisLine={false} interval={1} />
                <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip cursor={{ fill: '#E8F5E9' }} contentStyle={TIP} formatter={(v: unknown) => [String(v), 'Orders']} />
                <Bar dataKey="count" radius={[8, 8, 0, 0]} animationDuration={1000}>
                  {hours.map((h) => <Cell key={h.h} fill={peakHour && h.h === peakHour.h ? '#FFB300' : '#81C784'} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title="Where orders go" subtitle="Delivery areas with the most orders">
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={areas} layout="vertical" margin={{ top: 0, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="#E3EBE0" strokeDasharray="3 6" horizontal={false} />
                <XAxis type="number" tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
                <YAxis type="category" dataKey="name" width={96} tick={{ ...AXIS, fill: '#15261A', fontWeight: 600 }} tickLine={false} axisLine={false} />
                <Tooltip cursor={{ fill: '#E8F5E9' }} contentStyle={TIP} formatter={(v: unknown) => [String(v), 'Orders']} />
                <Bar dataKey="count" fill="#2E7D32" radius={[0, 12, 12, 0]} barSize={18} animationDuration={1000} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      <Panel title="Latest orders" action={<Link href="/admin/orders" className="inline-flex items-center gap-1 font-bold text-leaf hover:underline">See all <ArrowRight size={18} /></Link>}>
        <ul className="divide-y divide-line">
          {orders.slice(0, 6).map((o) => (
            <li key={o.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3.5">
              <div className="flex -space-x-3">
                {o.items.slice(0, 3).map((it) => {
                  const p = photoByProduct.get(it.productId);
                  return <SmartImage key={it.productId} src={p?.image} alt={p?.name ?? 'Item'} emoji={p?.emoji} className="h-11 w-11 rounded-full text-base ring-2 ring-white" />;
                })}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-bold">{o.code} <span className="font-medium text-ink-mute">· {customerLabel(o, me.role)}, {o.area}</span></p>
                <p className="text-sm text-ink-mute">{timeAgo(o.placedAt)}</p>
              </div>
              <p className="font-extrabold">{formatTZS(orderTotal(o))}</p>
              <StatusPill status={o.status} />
            </li>
          ))}
        </ul>
      </Panel>

      <RestockModal open={restockFor !== null} onClose={() => setRestockFor(null)} products={restockProducts} productId={restockFor ?? undefined} />
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Guarded perm="dashboard.view">
      <Dashboard />
    </Guarded>
  );
}
