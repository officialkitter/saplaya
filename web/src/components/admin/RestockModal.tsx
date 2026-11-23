'use client';

import { userFacingMessage } from '@/lib/user-facing-error';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Minus, Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Fields';
import { Modal } from '@/components/ui/Modal';
import { SmartImage } from '@/components/ui/SmartImage';
import { formatNum } from '@/lib/format';
import { useDB, useMe, useToast } from '@/lib/store';
import type { Product } from '@/lib/types';

/** Add stock when a harvest arrives. Every change is written to the stock history. */
export function RestockModal({
  open, onClose, products, productId,
}: { open: boolean; onClose: () => void; products: Product[]; productId?: string }) {
  const me = useMe();
  const restock = useDB((s) => s.restock);
  const suppliers = useDB((s) => s.suppliers);
  const push = useToast((s) => s.push);
  const [id, setId] = useState(productId ?? '');
  const [qty, setQty] = useState('10');
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  useEffect(() => {
    if (open) {
      setId(productId ?? products[0]?.id ?? '');
      setQty('10');
      setQuery('');
    }
  }, [open, productId, products]);

  const product = products.find((p) => p.id === id);
  const productFarm = product ? suppliers.find((supplier) => supplier.id === product.supplierId)?.name : undefined;
  const n = Number(qty);
  const valid = !!product && Number.isFinite(n) && n > 0 && n <= 10000;
  const visibleProducts = useMemo(() => {
    const term = query.trim().toLowerCase();
    return products.filter((item) =>
      !term
      || item.name.toLowerCase().includes(term)
      || suppliers.find((supplier) => supplier.id === item.supplierId)?.name.toLowerCase().includes(term)
    );
  }, [products, query, suppliers]);

  async function save() {
    if (!product || !valid || !me || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      await restock(product.id, n, me.name);
      push(`Added ${formatNum(n)} ${product.unit} of ${product.name}.`);
      onClose();
    } catch (error) {
      push(userFacingMessage(error, 'Could not update stock.'), 'bad');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={() => { if (!savingRef.current) onClose(); }} title="Add stock">
      <div className="space-y-4">
        <Field label="Which product arrived?" hint="Search and tap one product">
          <div className="relative">
            <Search size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-mute" />
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search product or farm" className="pl-10" />
          </div>
        </Field>
        <div className="max-h-48 space-y-2 overflow-y-auto rounded-2xl border border-line bg-milk p-2">
          {visibleProducts.length === 0 ? (
            <p className="p-4 text-center text-sm text-ink-mute">No products match this search.</p>
          ) : visibleProducts.map((item) => {
            const selected = item.id === id;
            const farm = suppliers.find((supplier) => supplier.id === item.supplierId)?.name;
            return (
              <button
                type="button"
                key={item.id}
                onClick={() => setId(item.id)}
                aria-pressed={selected}
                className={`flex w-full items-center gap-3 rounded-xl border p-2 text-left transition ${selected ? 'border-leaf bg-leaf-soft shadow-soft' : 'border-transparent bg-white hover:border-sprout'}`}
              >
                <SmartImage src={item.image} alt={item.name} emoji={item.emoji} className="h-12 w-12 shrink-0 rounded-xl" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-extrabold text-ink">{item.name}</p>
                  <p className="truncate text-sm text-ink-mute">{farm ?? 'Farm'} · {formatNum(item.stock)} {item.unit} in stock</p>
                </div>
                {selected && <span className="rounded-full bg-leaf px-2.5 py-1 text-xs font-bold text-white">Selected</span>}
              </button>
            );
          })}
        </div>
        {product && (
          <div className="flex items-center gap-3 rounded-2xl bg-milk p-3">
            <SmartImage src={product.image} alt={product.name} emoji={product.emoji} className="h-14 w-14 rounded-xl text-xl" />
            <p className="min-w-0 break-words text-ink-soft">
              {productFarm && !me?.supplierId ? <>{productFarm}<br /></> : null}
              In stock now: <b className="text-ink">{formatNum(product.stock)} {product.unit}</b>
            </p>
          </div>
        )}
        <Field label={`How much did you add${product ? ` (${product.unit})` : ''}?`}>
          <div className="flex items-center gap-2">
            <button type="button" aria-label="Less" onClick={() => setQty(String(Math.max(1, n - 5)))} className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-leaf-soft text-leaf-deep hover:bg-[#d7ecd9]"><Minus size={20} /></button>
            <Input type="number" inputMode="decimal" min={1} max={10000} value={qty} onChange={(e) => setQty(e.target.value)} className="min-w-0 flex-1 text-center text-xl font-extrabold" />
            <button type="button" aria-label="More" onClick={() => setQty(String(Math.min(10000, (Number.isFinite(n) ? n : 0) + 5)))} className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-leaf-soft text-leaf-deep hover:bg-[#d7ecd9]"><Plus size={20} /></button>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {[10, 25, 50, 100].map((q) => (
              <button key={q} type="button" onClick={() => setQty(String(q))} className="min-h-10 rounded-full border-2 border-line px-3.5 py-1 text-sm font-bold text-ink-soft hover:border-sprout">+{q}</button>
            ))}
          </div>
        </Field>
        {product && valid && (
          <p className="rounded-2xl bg-leaf-soft p-3 font-semibold text-leaf-deep">
            After this you will have {formatNum(product.stock + n)} {product.unit}.
          </p>
        )}
        <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:justify-end">
          <Button variant="ghost" disabled={saving} onClick={onClose}>Cancel</Button>
          <Button onClick={() => { void save(); }} disabled={!valid || saving}>{saving ? 'Adding…' : 'Add stock'}</Button>
        </div>
      </div>
    </Modal>
  );
}
