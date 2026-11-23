'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Ban, CheckCircle2, Clock3, Download, FileSpreadsheet, PackageCheck, Upload } from 'lucide-react';
import { Guarded, PageHeader, Panel } from '@/components/admin/Guard';
import { Button } from '@/components/ui/Button';
import { fetchAdmin } from '@/lib/supabase';
import { useToast } from '@/lib/store';
import { userFacingMessage } from '@/lib/user-facing-error';
import { SmartImage } from '@/components/ui/SmartImage';
import { useGlobalMarket } from '@/lib/global-market';

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

function Claims() {
  const push = useToast((state) => state.push);
  const { formatPrice } = useGlobalMarket();
  const [available, setAvailable] = useState<ClaimOrder[]>([]);
  const [mine, setMine] = useState<ClaimOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [view, setView] = useState<'available' | 'ongoing' | 'history'>('available');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [availableRows, mineRows] = await Promise.all([
        fetchAdmin<ClaimOrder[]>('/admin/claims/available'),
        fetchAdmin<ClaimOrder[]>('/admin/claims/my'),
      ]);
      setAvailable(availableRows);
      setMine(mineRows);
    } catch (error) {
      push(userFacingMessage(error, 'Could not load orders.'), 'bad');
    } finally {
      setLoading(false);
    }
  }, [push]);

  useEffect(() => { void reload(); }, [reload]);

  const ongoing = useMemo(() => mine.filter((order) => ['pending', 'packing', 'en_route'].includes(order.status)), [mine]);
  const history = useMemo(() => mine.filter((order) => ['delivered', 'cancelled'].includes(order.status)), [mine]);
  const visible = view === 'available' ? available : view === 'ongoing' ? ongoing : history;

  async function claim(order: ClaimOrder) {
    setBusyId(order.id);
    try {
      await fetchAdmin(`/admin/claims/${encodeURIComponent(order.id)}/claim`, { method: 'POST' });
      push(`Order ${order.code} is now yours.`);
      setView('ongoing');
      await reload();
    } catch (error) {
      push(userFacingMessage(error, 'Could not claim this order.'), 'bad');
    } finally {
      setBusyId(null);
    }
  }

  async function release(order: ClaimOrder) {
    setBusyId(order.id);
    try {
      await fetchAdmin(`/admin/claims/${encodeURIComponent(order.id)}/release`, { method: 'POST' });
      push(`Order ${order.code} was released.`);
      await reload();
    } catch (error) {
      push(userFacingMessage(error, 'Could not release this claim.'), 'bad');
    } finally {
      setBusyId(null);
    }
  }

    async function claimSelected() {
      if (!selected.size) return;
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
      <Panel title={view === 'available' ? 'Available for claim' : view === 'ongoing' ? 'Ongoing claims' : 'Claims history'} subtitle="Every action is visible in one place.">
        {view === 'available' && available.length > 0 && (
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-milk p-3">
            <label className="flex items-center gap-2 font-bold">
              <input
                type="checkbox"
                checked={selected.size === available.length}
                onChange={(event) => setSelected(event.target.checked ? new Set(available.map((order) => order.id)) : new Set())}
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
            {visible.map((order) => {
              const status = statusStyle[order.status] ?? { label: order.status, className: 'bg-leaf-soft text-leaf-deep' };
              return (
                <li key={order.id} className="flex flex-col gap-3 rounded-2xl border border-line bg-white p-4 sm:flex-row sm:items-center">
                  {view === 'available' && (
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
                      className="h-5 w-5"
                    />
                  )}
                  {order.items && order.items.length > 0 && (
                    <div className="flex -space-x-2" aria-label={`${order.item_count ?? 0} basket items`}>
                      {order.items.slice(0, 4).map((item, index) => (
                        <SmartImage
                          key={`${order.id}-${index}`}
                          src={item.image_url ?? ''}
                          alt={item.name}
                          className="h-12 w-12 rounded-xl ring-2 ring-white"
                        />
                      ))}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-display text-lg font-extrabold">{order.code}</p>
                    <p className="text-sm text-ink-soft">{order.supplier_name}</p>
                    {(order.item_count !== undefined || order.basket_total !== undefined) && (
                      <p className="mt-1 text-sm font-bold text-leaf-deep">
                        {order.item_count ?? 0} items · {formatPrice(order.basket_total ?? 0)}
                      </p>
                    )}
                    {order.claimed_at && <p className="mt-1 text-xs text-ink-mute">Claimed {new Date(order.claimed_at).toLocaleString()}</p>}
                  </div>
                  <span className={`w-fit rounded-full px-3 py-1.5 text-sm font-extrabold ${status.className}`}>{status.label}</span>
                  {view === 'available' ? (
                    <Button disabled={busyId !== null} onClick={() => void claim(order)}>{busyId === order.id ? 'Claiming…' : 'Claim order'}</Button>
                  ) : view === 'ongoing' ? (
                    <Button variant="danger" disabled={busyId !== null} onClick={() => void release(order)}>{busyId === order.id ? 'Releasing…' : 'Release claim'}</Button>
                  ) : null}
                </li>
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
