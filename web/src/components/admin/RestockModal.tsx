'use client';

import { useEffect, useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select } from '@/components/ui/Fields';
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

  useEffect(() => {
    if (open) {
      setId(productId ?? products[0]?.id ?? '');
      setQty('10');
    }
  }, [open, productId, products]);

  const product = products.find((p) => p.id === id);
  const productFarm = product ? suppliers.find((supplier) => supplier.id === product.supplierId)?.name : undefined;
  const n = Number(qty);
  const valid = !!product && Number.isFinite(n) && n > 0;

  async function save() {
    if (!product || !valid || !me) return;
    try {
      await restock(product.id, n, me.name);
      push(`Added ${formatNum(n)} ${product.unit} of ${product.name}.`);
      onClose();
    } catch (error) {
      push(error instanceof Error ? error.message : 'Could not update stock.', 'bad');
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Add stock">
      <div className="space-y-4">
        <Field label="Which product arrived?">
          <Select value={id} onChange={(e) => setId(e.target.value)}>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}{!me?.supplierId && suppliers.length ? ` · ${suppliers.find((supplier) => supplier.id === p.supplierId)?.name ?? 'Farm'}` : ''}
              </option>
            ))}
          </Select>
        </Field>
        {product && (
          <div className="flex items-center gap-3 rounded-2xl bg-milk p-3">
            <SmartImage src={product.image} alt={product.name} emoji={product.emoji} className="h-14 w-14 rounded-xl text-xl" />
            <p className="text-ink-soft">
              {productFarm && !me?.supplierId ? <>{productFarm}<br /></> : null}
              In stock now: <b className="text-ink">{formatNum(product.stock)} {product.unit}</b>
            </p>
          </div>
        )}
        <Field label={`How much did you add${product ? ` (${product.unit})` : ''}?`}>
          <div className="flex items-center gap-2">
            <button type="button" aria-label="Less" onClick={() => setQty(String(Math.max(1, n - 5)))} className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-leaf-soft text-leaf-deep hover:bg-[#d7ecd9]"><Minus size={20} /></button>
            <Input type="number" inputMode="decimal" min={1} value={qty} onChange={(e) => setQty(e.target.value)} className="text-center text-xl font-extrabold" />
            <button type="button" aria-label="More" onClick={() => setQty(String((Number.isFinite(n) ? n : 0) + 5))} className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-leaf-soft text-leaf-deep hover:bg-[#d7ecd9]"><Plus size={20} /></button>
          </div>
          <div className="mt-2 flex gap-2">
            {[10, 25, 50, 100].map((q) => (
              <button key={q} type="button" onClick={() => setQty(String(q))} className="rounded-full border-2 border-line px-3.5 py-1 text-sm font-bold text-ink-soft hover:border-sprout">+{q}</button>
            ))}
          </div>
        </Field>
        {product && valid && (
          <p className="rounded-2xl bg-leaf-soft p-3 font-semibold text-leaf-deep">
            After this you will have {formatNum(product.stock + n)} {product.unit}.
          </p>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => { void save(); }} disabled={!valid}>Add stock</Button>
        </div>
      </div>
    </Modal>
  );
}
