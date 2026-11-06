'use client';

import { useEffect, useMemo, useState } from 'react';
import { Panel } from '@/components/admin/Guard';
import { Select } from '@/components/ui/Fields';
import { formatTZS } from '@/lib/format';
import { can } from '@/lib/roles';
import { fetchAdmin } from '@/lib/supabase';
import { useToast } from '@/lib/store';
import type { TeamMember } from '@/lib/types';

type Summary = {
  order_count: number;
  pending_orders: number;
  in_progress_orders: number;
  delivered_orders: number;
  cancelled_orders: number;
  delivered_value: number;
  open_order_value: number;
  cancelled_value: number;
  unique_customers: number;
  returning_customers: number;
};
type DashboardAnalytics = {
  operations?: Summary;
  finance?: { summary: Summary; payments: { method: string; orders: number; delivered_value: number }[]; reporting_note: string };
  marketing?: {
    summary: Summary;
    top_products: { name: string; category: string; units: number; value: number }[];
    categories: { category: string; value: number }[];
    modes: { mode: string; orders: number; value: number }[];
    reporting_note: string;
  };
  stores?: { summary: Summary; farms: { name: string; orders: number; delivered_value: number }[] };
  system?: {
    farms?: number;
    products?: number;
    team_members?: number;
    open_applications?: number;
    pending_catalog_products?: number;
    departments?: number;
    roles?: number;
  };
};

function Metric({ label, value, note }: { label: string; value: string | number; note?: string }) {
  return (
    <div className="rounded-2xl bg-milk p-4">
      <p className="text-sm font-semibold text-ink-mute">{label}</p>
      <p className="mt-1 font-display text-2xl font-extrabold">{value}</p>
      {note && <p className="mt-1 text-xs text-ink-mute">{note}</p>}
    </div>
  );
}

export function DepartmentDashboards({ member }: { member: TeamMember }) {
  const push = useToast((state) => state.push);
  const [rangeDays, setRangeDays] = useState('14');
  const [data, setData] = useState<DashboardAnalytics | null>(null);
  const [loading, setLoading] = useState(false);

  const requestedViews = useMemo(() => [
    can(member.role, 'dashboard.view', member.permissions),
    can(member.role, 'finance.view', member.permissions),
    can(member.role, 'marketing.view', member.permissions),
    can(member.role, 'stores.view', member.permissions),
    can(member.role, 'system.view', member.permissions),
  ].some(Boolean), [member.role, member.permissions]);

  useEffect(() => {
    if (!requestedViews) return;
    let active = true;
    const to = new Date();
    const from = new Date(to.getTime() - Number(rangeDays) * 86_400_000);
    setData(null);
    setLoading(true);
    void fetchAdmin<DashboardAnalytics>(
      `/admin/dashboard-analytics?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`,
    ).then((result) => {
      if (active) setData(result);
    }).catch((error: unknown) => {
      if (active) push(error instanceof Error ? error.message : 'Could not load department dashboards.', 'bad');
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [push, rangeDays, requestedViews]);

  if (!requestedViews) return null;

  return (
    <section className="space-y-5" aria-labelledby="department-dashboards-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="department-dashboards-title" className="font-display text-2xl font-extrabold">Department dashboards</h2>
          <p className="text-ink-mute">Showing access permitted for {member.department ?? 'your role'}.</p>
        </div>
        <label className="flex items-center gap-2 text-sm font-bold">
          Reporting period
          <Select value={rangeDays} onChange={(event) => setRangeDays(event.target.value)} aria-label="Department dashboard date range">
            <option value="7">Last 7 days</option>
            <option value="14">Last 14 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
            <option value="365">Last 12 months</option>
          </Select>
        </label>
      </div>

      {loading && <p role="status" className="rounded-2xl bg-white p-4 text-ink-mute">Loading current department metrics…</p>}

      {data?.operations && (
        <Panel title="Operations summary" subtitle="Orders placed during this period, grouped by their current status.">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric label="Farm orders" value={data.operations.order_count} />
            <Metric label="Waiting to be packed" value={data.operations.pending_orders} />
            <Metric label="In progress" value={data.operations.in_progress_orders} />
            <Metric label="Delivered" value={data.operations.delivered_orders} />
            <Metric label="Open order value" value={formatTZS(data.operations.open_order_value)} note="Pending, packing, or in transit" />
            <Metric label="Delivered order value" value={formatTZS(data.operations.delivered_value)} note="Operational estimate" />
          </div>
        </Panel>
      )}

      {data?.finance && (
        <Panel title="Finance & accounting" subtitle="Orders placed during the selected period, grouped by their current status.">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric label="Delivered order value" value={formatTZS(data.finance.summary.delivered_value)} note={`${data.finance.summary.delivered_orders} delivered farm orders`} />
            <Metric label="Open order value" value={formatTZS(data.finance.summary.open_order_value)} note="Pending, packing, or in transit" />
            <Metric label="Cancelled order value" value={formatTZS(data.finance.summary.cancelled_value)} note={`${data.finance.summary.cancelled_orders} cancelled orders`} />
            <Metric label="Total farm orders" value={data.finance.summary.order_count} note="All statuses" />
          </div>
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {data.finance.payments.map((payment) => (
              <li key={payment.method} className="flex justify-between gap-3 rounded-xl border border-line p-3 text-sm">
                <span className="font-semibold">{payment.method.replaceAll('_', ' ')}</span>
                <span>{payment.orders} orders · {formatTZS(payment.delivered_value)} delivered</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-ink-mute">{data.finance.reporting_note}</p>
        </Panel>
      )}

      {data?.marketing && (
        <Panel title="Marketing & demand" subtitle="Customer demand, product mix, and repeat purchasing; no campaign attribution is implied.">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric label="Unique customers" value={data.marketing.summary.unique_customers} />
            <Metric label="Returning customers" value={data.marketing.summary.returning_customers} note="More than one order in this period" />
            <Metric label="Delivered farm orders" value={data.marketing.summary.delivered_orders} />
            <Metric label="Delivered order value" value={formatTZS(data.marketing.summary.delivered_value)} />
          </div>
          <div className="mt-4 grid gap-5 lg:grid-cols-2">
            <div>
              <h3 className="mb-2 font-bold">Top products</h3>
              <ul className="space-y-2">
                {data.marketing.top_products.slice(0, 5).map((product) => (
                  <li key={`${product.name}:${product.category}`} className="flex justify-between gap-3 rounded-xl bg-milk p-3 text-sm">
                    <span className="font-semibold">{product.name} <span className="text-ink-mute">· {product.units} units</span></span>
                    <span className="font-bold">{formatTZS(product.value)}</span>
                  </li>
                ))}
                {data.marketing.top_products.length === 0 && <li className="rounded-xl bg-milk p-3 text-sm text-ink-mute">No delivered product sales in this period.</li>}
              </ul>
            </div>
            <div>
              <h3 className="mb-2 font-bold">Demand by product category</h3>
              <ul className="space-y-2">
                {data.marketing.categories.slice(0, 5).map((category) => (
                  <li key={category.category} className="flex justify-between gap-3 rounded-xl bg-milk p-3 text-sm">
                    <span className="font-semibold">{category.category}</span>
                    <span className="font-bold">{formatTZS(category.value)}</span>
                  </li>
                ))}
                {data.marketing.categories.length === 0 && <li className="rounded-xl bg-milk p-3 text-sm text-ink-mute">No category sales in this period.</li>}
              </ul>
            </div>
          </div>
          <p className="mt-3 text-xs text-ink-mute">{data.marketing.reporting_note}</p>
        </Panel>
      )}

      {data?.stores && (
        <Panel title="Stores & farm operations" subtitle="Farm-level order volume and delivered sales for the selected period.">
          <div className="grid gap-3 sm:grid-cols-3">
            <Metric label="Farm orders" value={data.stores.summary.order_count} />
            <Metric label="In progress" value={data.stores.summary.in_progress_orders} />
            <Metric label="Delivered order value" value={formatTZS(data.stores.summary.delivered_value)} />
          </div>
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {data.stores.farms.map((farm) => (
              <li key={farm.name} className="flex justify-between gap-3 rounded-xl border border-line p-3 text-sm">
                <span className="font-semibold">{farm.name} · {farm.orders} orders</span>
                <span className="font-bold">{formatTZS(farm.delivered_value)}</span>
              </li>
            ))}
            {data.stores.farms.length === 0 && <li className="text-sm text-ink-mute">No farm orders in this period.</li>}
          </ul>
        </Panel>
      )}

      {data?.system && (
        <Panel title="System administration" subtitle="Current platform records and queues. Access remains permission-gated.">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {data.system.farms !== undefined && <Metric label="Active farms" value={data.system.farms} />}
            {data.system.products !== undefined && <Metric label="Product listings" value={data.system.products} />}
            {data.system.team_members !== undefined && <Metric label="Active team members" value={data.system.team_members} />}
            {data.system.open_applications !== undefined && <Metric label="Open farm applications" value={data.system.open_applications} />}
            {data.system.pending_catalog_products !== undefined && <Metric label="Shared catalog prices awaiting approval" value={data.system.pending_catalog_products} />}
            {data.system.departments !== undefined && <Metric label="Departments" value={data.system.departments} />}
            {data.system.roles !== undefined && <Metric label="Roles" value={data.system.roles} />}
          </div>
        </Panel>
      )}
    </section>
  );
}
