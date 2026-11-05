import type { Movement, OrderStatus, Product, Role, Supplier, SupplierOrder, Settings, TeamMember } from './types';
import { STATUS_ALL, shortDate } from './format';
import { isFarmRole } from './roles';

const DAY = 86_400_000;

export const orderTotal = (o: SupplierOrder) => o.items.reduce((n, i) => n + i.qty * i.unitPrice, 0);
export const countsAsSale = (o: SupplierOrder) => o.status !== 'cancelled';

export function dayKeys(days: number, now = Date.now()) {
  const out: { start: number; end: number; label: string }[] = [];
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  for (let i = days - 1; i >= 0; i--) {
    const start = new Date(today);
    start.setDate(today.getDate() - i);
    const end = new Date(start);
    end.setDate(start.getDate() + 1);
    out.push({ start: start.getTime(), end: end.getTime(), label: shortDate(start.getTime()) });
  }
  return out;
}

export function salesByDay(orders: SupplierOrder[], days = 14) {
  return dayKeys(days).map((d) => ({
    day: d.label,
    sales: orders
      .filter((o) => countsAsSale(o) && o.placedAt >= d.start && o.placedAt < d.end)
      .reduce((n, o) => n + orderTotal(o), 0),
  }));
}

export function stockFlowByDay(movements: Movement[], days = 14) {
  return dayKeys(days).map((d) => {
    const inDay = movements.filter((m) => m.at >= d.start && m.at < d.end);
    return {
      day: d.label,
      sold: inDay.filter((m) => m.kind === 'sale').reduce((n, m) => n + -m.qtyChange, 0),
      added: inDay.filter((m) => m.kind === 'restock' || m.kind === 'cancel_return').reduce((n, m) => n + m.qtyChange, 0),
    };
  });
}

export function statusCounts(orders: SupplierOrder[]) {
  return STATUS_ALL.map((s) => ({ status: s as OrderStatus, count: orders.filter((o) => o.status === s).length }));
}

export function topProducts(orders: SupplierOrder[], products: Product[], n = 6) {
  const byId = new Map(products.map((p) => [p.id, p]));
  const totals = new Map<string, number>();
  orders.filter(countsAsSale).forEach((o) =>
    o.items.forEach((i) => totals.set(i.productId, (totals.get(i.productId) ?? 0) + i.qty * i.unitPrice))
  );
  return Array.from(totals.entries())
    .map(([id, sales]) => ({ name: byId.get(id)?.name ?? 'Item', sales }))
    .sort((a, b) => b.sales - a.sales)
    .slice(0, n);
}

export function salesByFarm(orders: SupplierOrder[], suppliers: Supplier[]) {
  return suppliers
    .map((s) => ({
      name: s.name,
      sales: orders.filter((o) => o.supplierId === s.id && countsAsSale(o)).reduce((n, o) => n + orderTotal(o), 0),
    }))
    .filter((x) => x.sales > 0)
    .sort((a, b) => b.sales - a.sales);
}

export const isLow = (p: Product) => p.active && p.stock <= p.lowStockAt;

/** Orders per hour of the day (6am to 10pm) so teams can plan packing shifts. */
export function ordersByHour(orders: SupplierOrder[]) {
  const counts = new Array(24).fill(0) as number[];
  const hourFormatter = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    hourCycle: 'h23',
  });
  orders.filter(countsAsSale).forEach((o) => {
    counts[Number(hourFormatter.format(new Date(o.placedAt)))] += 1;
  });
  return counts
    .map((count, h) => ({ hour: `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? 'am' : 'pm'}`, h, count }))
    .filter((x) => x.h >= 6 && x.h <= 22);
}

/** Money earned per product category. */
export function salesByCategory(orders: SupplierOrder[], products: Product[]) {
  const byId = new Map(products.map((p) => [p.id, p]));
  const totals = new Map<string, number>();
  orders.filter(countsAsSale).forEach((o) =>
    o.items.forEach((i) => {
      const cat = byId.get(i.productId)?.category ?? 'Other';
      totals.set(cat, (totals.get(cat) ?? 0) + i.qty * i.unitPrice);
    })
  );
  return Array.from(totals.entries()).map(([name, sales]) => ({ name, sales })).sort((a, b) => b.sales - a.sales);
}

/** Orders per delivery area. */
export function ordersByArea(orders: SupplierOrder[], n = 7) {
  const counts = new Map<string, number>();
  orders.filter(countsAsSale).forEach((o) => counts.set(o.area, (counts.get(o.area) ?? 0) + 1));
  return Array.from(counts.entries()).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, n);
}

/** Retail vs wholesale sales per day, for the stacked chart. */
export function modeSplitByDay(orders: SupplierOrder[], days = 14) {
  return dayKeys(days).map((d) => {
    const inDay = orders.filter((o) => countsAsSale(o) && o.placedAt >= d.start && o.placedAt < d.end);
    return {
      day: d.label,
      retail: inDay.filter((o) => o.mode === 'retail').reduce((n, o) => n + orderTotal(o), 0),
      wholesale: inDay.filter((o) => o.mode === 'wholesale').reduce((n, o) => n + orderTotal(o), 0),
    };
  });
}

/** Compare the last 7 days with the 7 days before. Returns percent change, or null when there is nothing to compare. */
export function weekChange(orders: SupplierOrder[], now = Date.now()): number | null {
  const sum = (from: number, to: number) =>
    orders.filter((o) => countsAsSale(o) && o.placedAt >= from && o.placedAt < to).reduce((n, o) => n + orderTotal(o), 0);
  const thisWeek = sum(now - 7 * DAY, now + 1);
  const lastWeek = sum(now - 14 * DAY, now - 7 * DAY);
  if (lastWeek === 0) return null;
  return Math.round(((thisWeek - lastWeek) / lastWeek) * 100);
}

// ---------- Privacy: what each role may see about a customer ----------
export function customerLabel(o: SupplierOrder, role: Role, scope?: 'platform' | 'farm'): string {
  return isFarmRole(role, scope) ? o.customerName.split(' ')[0] : o.customerName;
}
export function customerPhone(o: SupplierOrder, role: Role, scope?: 'platform' | 'farm'): string {
  return isFarmRole(role, scope) ? 'Hidden to protect the customer' : o.customerPhone;
}

// ---------- Delivery fee preview (matches the app and the backend) ----------
export function deliveryFee(km: number, s: Settings): number {
  if (km <= s.freeRadiusKm) return 0;
  if (km <= s.midRadiusKm) return s.midFee;
  return s.farFee;
}

// ---------- Who can a person pause or change? ----------
export function canManageMember(me: TeamMember, target: TeamMember): boolean {
  if (me.id === target.id || !me.permissions?.includes('team.manage')) return false;
  if (me.roleScope === 'farm' && (target.roleScope !== 'farm' || me.supplierId !== target.supplierId)) return false;
  return (target.permissions ?? []).every((permission) => me.permissions?.includes(permission));
}
