import clsx, { type ClassValue } from 'clsx';
import type { OrderStatus } from './types';

export const cn = (...inputs: ClassValue[]) => clsx(inputs);
export const TANZANIA_TIME_ZONE = 'Africa/Dar_es_Salaam';

export const formatTZS = (n: number) => 'TSh ' + Math.round(n).toLocaleString('en-US');
export const formatNum = (n: number) => (Math.round(n * 10) / 10).toLocaleString('en-US');

export type LocalDayPeriod = 'morning' | 'afternoon' | 'evening';

export function localDayPeriod(ts = Date.now()): LocalDayPeriod {
  const hour = new Date(ts).getHours();
  return hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
}

export function tanzaniaHour(ts = Date.now()): number {
  return Number(new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    hourCycle: 'h23',
    timeZone: TANZANIA_TIME_ZONE,
  }).format(new Date(ts)));
}

export function timeAgo(ts: number, now = Date.now()): string {
  const m = Math.max(1, Math.round((now - ts) / 60000));
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? '' : 's'} ago`;
}

export function shortDate(ts: number): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: TANZANIA_TIME_ZONE,
  }).format(new Date(ts));
}

export function tanzaniaDateTime(ts: number | string): string {
  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: TANZANIA_TIME_ZONE,
  }).format(new Date(ts));
}

export function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

export interface StatusMeta {
  label: string;
  color: string;
  soft: string;
  verb: string; // what the next button says
}

export const STATUS: Record<OrderStatus, StatusMeta> = {
  pending: { label: 'New', color: '#FFB300', soft: '#FFF8E1', verb: 'Start packing' },
  packing: { label: 'Packing', color: '#0288D1', soft: '#E1F5FE', verb: 'Send out' },
  en_route: { label: 'On the way', color: '#7B1FA2', soft: '#F3E5F5', verb: 'Mark delivered' },
  delivered: { label: 'Delivered', color: '#2E7D32', soft: '#E8F5E9', verb: '' },
  cancelled: { label: 'Cancelled', color: '#D32F2F', soft: '#FFEBEE', verb: '' },
};

export const STATUS_FLOW: OrderStatus[] = ['pending', 'packing', 'en_route', 'delivered'];
export const STATUS_ALL: OrderStatus[] = ['pending', 'packing', 'en_route', 'delivered', 'cancelled'];

export const nextStatus = (s: OrderStatus): OrderStatus | null => {
  const i = STATUS_FLOW.indexOf(s);
  return i >= 0 && i < STATUS_FLOW.length - 1 ? STATUS_FLOW[i + 1] : null;
};
