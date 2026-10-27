'use client';

import { motion } from 'framer-motion';
import { EyeOff, PackagePlus, Pencil, Plus, Search } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Guarded, PageHeader } from '@/components/admin/Guard';
import { RestockModal } from '@/components/admin/RestockModal';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/Bits';
import { Field, Input, Select } from '@/components/ui/Fields';
import { Modal } from '@/components/ui/Modal';
import { SmartImage } from '@/components/ui/SmartImage';
import { cn, formatNum, formatTZS } from '@/lib/format';
import { can } from '@/lib/roles';
import { isLow } from '@/lib/stats';
import { fetchAdmin } from '@/lib/supabase';
import { useDB, useScope, useToast } from '@/lib/store';
import type { Product, Supplier } from '@/lib/types';

const CATEGORIES = ['Vegetables', 'Leafy', 'Fruit', 'Grains'];
const UNITS = ['kg', 'bunch', 'piece', 'head', 'cob'];
const EMOJI: Record<string, string> = { Vegetables: '🥕', Leafy: '🥬', Fruit: '🍎', Grains: '🌽' };

interface Form {
  name: string; category: string; unit: string; retail: string; wholesale: string;
  min: string; low: string; image: string; opening: string; active: boolean;
}
const blank: Form = { name: '', category: 'Vegetables', unit: 'kg', retail: '', wholesale: '', min: '10', low: '10', image: '', opening: '0', active: true };
const fromProduct = (p: Product): Form => ({
  name: p.name, category: p.category, unit: p.unit, retail: String(p.retailPrice), wholesale: String(p.wholesalePrice),
  min: String(p.wholesaleMinQty), low: String(p.lowStockAt), image: p.image, opening: '0', active: p.active,
});

type StockableCatalogItem = {
  id: string;
  name: string;
  category: string;
  unit: string;
  retail_price: number;
  wholesale_price: number;
  image_url: string | null;
  price_approved: boolean;
};
type StockableListing = {
  id: string;
  catalog_product_id: string | null;
  name: string;
  stock: number;
  active: boolean;
};
type StockableCatalogResponse = { items: StockableCatalogItem[]; listings: StockableListing[] };

function Products() {
  const { me, farmId, suppliers, products } = useScope();
  const addProduct = useDB((s) => s.addProduct);
  const updateProduct = useDB((s) => s.updateProduct);
  const stockCatalogProduct = useDB((s) => s.stockCatalogProduct);
  const publishCatalogProduct = useDB((s) => s.publishCatalogProduct);
  const push = useToast((s) => s.push);

  const [q, setQ] = useState('');
  const [farm, setFarm] = useState('all');
  const [stockFarmId, setStockFarmId] = useState(farmId ?? '');
  const [stockCatalog, setStockCatalog] = useState<StockableCatalogResponse | null>(null);
  const [stockCatalogLoading, setStockCatalogLoading] = useState(false);
  const [stockCatalogBusyId, setStockCatalogBusyId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Product | 'new' | null>(null);
  const [restockId, setRestockId] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(blank);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const farmName = useMemo(() => new Map(suppliers.map((s) => [s.id, s.name])), [suppliers]);
  const visible = useMemo(() => {
    const t = q.trim().toLowerCase();
    return products.filter((p) => (farm === 'all' || p.supplierId === farm) && (!t || p.name.toLowerCase().includes(t) || p.category.toLowerCase().includes(t)));
  }, [products, q, farm]);

  const activeFarms = useMemo(() => suppliers.filter((supplier) => supplier.status === 'active'), [suppliers]);
  const stockTargetFarmId = farmId ?? stockFarmId;
  const loadStockCatalog = useCallback(async () => {
    if (!stockTargetFarmId) {
      setStockCatalog(null);
      return;
    }
    setStockCatalogLoading(true);
    try {
      const result = await fetchAdmin<StockableCatalogResponse>(
        `/admin/stockable-catalog?supplier_id=${encodeURIComponent(stockTargetFarmId)}`,
      );
      setStockCatalog(result);
    } catch (error) {
      push(error instanceof Error ? error.message : 'Could not load shared products.', 'bad');
    } finally {
      setStockCatalogLoading(false);
    }
  }, [push, stockTargetFarmId]);

  useEffect(() => {
    if (!farmId && !stockFarmId && activeFarms[0]) setStockFarmId(activeFarms[0].id);
  }, [activeFarms, farmId, stockFarmId]);

  useEffect(() => {
    if (can(me?.role, 'stock.adjust')) void loadStockCatalog();
  }, [loadStockCatalog, me?.role]);

  if (!me) return null;
  const canEdit = can(me.role, 'products.edit') && !!farmId;
  const canStock = can(me.role, 'stock.adjust');
  const visibleCatalog = (stockCatalog?.items ?? []).filter((item) => {
    const text = q.trim().toLowerCase();
    return !text || `${item.name} ${item.category}`.toLowerCase().includes(text);
  });
  const listingByCatalog = new Map((stockCatalog?.listings ?? []).map((listing) => [
    listing.catalog_product_id ?? `name:${listing.name.trim().toLowerCase()}`,
    listing,
  ]));

  async function addSharedStock(item: StockableCatalogItem) {
    if (!stockTargetFarmId) {
      push('Choose an active farm first.', 'bad');
      return;
    }
    setStockCatalogBusyId(item.id);
    try {
      const result = await stockCatalogProduct(item.id, stockTargetFarmId, 10);
      if (result.already_stocked) {
        push(`${item.name} already has stock at this farm. No changes were made.`);
      } else {
        push(`${item.name} was added with 10 ${item.unit} of stock.`);
      }
      await loadStockCatalog();
    } catch (error) {
      push(error instanceof Error ? error.message : 'Could not add this product to the farm.', 'bad');
    } finally {
      setStockCatalogBusyId(null);
    }
  }

  async function publishSharedProduct(item: StockableCatalogItem) {
    if (!stockTargetFarmId) return;
    setStockCatalogBusyId(item.id);
    try {
      await publishCatalogProduct(item.id, stockTargetFarmId);
      push(`${item.name} is now available in the shop.`);
      await loadStockCatalog();
    } catch (error) {
      push(error instanceof Error ? error.message : 'Could not make this product available.', 'bad');
    } finally {
      setStockCatalogBusyId(null);
    }
  }

  function openForm(p: Product | 'new') {
    setForm(p === 'new' ? blank : fromProduct(p));
    setErrors({});
    setEditing(p);
  }
  const set = (k: keyof Form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function save() {
    const err: Record<string, string> = {};
    const retail = Number(form.retail);
    const wholesale = Number(form.wholesale);
    if (form.name.trim().length < 2) err.name = 'Give the product a name.';
    if (!(retail > 0)) err.retail = 'Enter the shop price.';
    if (!(wholesale > 0)) err.wholesale = 'Enter the bulk price.';
    else if (retail > 0 && wholesale >= retail) err.wholesale = 'The bulk price should be lower than the shop price.';
    if (!(Number(form.min) > 0)) err.min = 'Enter the smallest bulk order.';
    setErrors(err);
    if (Object.keys(err).length || !me || !farmId) return;

    const base = {
      name: form.name.trim(), category: form.category, unit: form.unit,
      retailPrice: Math.round(retail), wholesalePrice: Math.round(wholesale),
      wholesaleMinQty: Math.round(Number(form.min)), lowStockAt: Math.max(0, Number(form.low) || 0),
      image: form.image.trim(), emoji: EMOJI[form.category] ?? '🥬', active: form.active,
    };
    try {
      if (editing === 'new') {
        await addProduct({ ...base, supplierId: farmId }, Math.max(0, Number(form.opening) || 0), me.name);
        push(`${base.name} listing saved. Shared prices are centrally approved; new catalog entries need review before sale.`);
      } else if (editing) {
        const priceChanged = editing.retailPrice !== base.retailPrice || editing.wholesalePrice !== base.wholesalePrice;
        await updateProduct(editing.id, base);
        push(priceChanged
          ? `${base.name} was updated. Its price request is waiting for Saplaya review.`
          : `${base.name} was updated.`);
      }
      setEditing(null);
    } catch (error) {
      push(error instanceof Error ? error.message : 'Could not save this product.', 'bad');
    }
  }

  return (
    <>
      <PageHeader
        title={farmId ? 'My products' : 'All products'}
        subtitle={canEdit ? 'Manage your harvest and stock. Shared product prices are set by Saplaya; submit price requests for review.' : farmId ? 'See what is in stock and add more when a harvest arrives. Shared prices are approved centrally.' : 'Every farm’s listings and stock. Shared customer prices are centrally approved.'}
        actions={canEdit ? <Button icon={<Plus size={20} />} onClick={() => openForm('new')}>Add product</Button> : undefined}
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-[1fr_auto]">
        <div className="relative">
          <Search size={20} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-mute" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search products" className="pl-12" aria-label="Search products" />
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

      {canStock && (
        <section className="mb-7 rounded-[1.75rem] border border-line bg-white p-5 shadow-soft sm:p-6">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="font-display text-xl font-extrabold">Shared catalog</h2>
              <p className="mt-1 text-[15px] text-ink-mute">Add a shared product to a farm with 10 units of stock. Products already stocked are left unchanged.</p>
            </div>
            {!farmId && (
              <div className="w-full sm:w-64">
                <Field label="Farm to stock">
                  <Select value={stockFarmId} onChange={(event) => setStockFarmId(event.target.value)} aria-label="Choose a farm for shared catalog stock">
                    <option value="">Choose an active farm</option>
                    {activeFarms.map((supplier: Supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
                  </Select>
                </Field>
              </div>
            )}
          </div>
          {!stockTargetFarmId ? (
            <p className="rounded-2xl bg-milk p-4 text-ink-soft">Add or activate a farm before stocking shared products.</p>
          ) : stockCatalogLoading && !stockCatalog ? (
            <p role="status" className="p-4 text-center text-ink-mute">Loading shared products…</p>
          ) : visibleCatalog.length === 0 ? (
            <p className="rounded-2xl bg-milk p-4 text-ink-soft">{q ? 'No shared products match your search.' : 'The shared catalog is empty.'}</p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {visibleCatalog.map((item) => {
                const listing = listingByCatalog.get(item.id)
                  ?? listingByCatalog.get(`name:${item.name.trim().toLowerCase()}`);
                const stocked = Number(listing?.stock ?? 0) > 0;
                const available = stocked && listing?.active === true && item.price_approved;
                return (
                  <li key={item.id} className="flex items-center gap-3 rounded-2xl border border-line p-3">
                    <SmartImage src={item.image_url ?? ''} alt={item.name} emoji={EMOJI[item.category] ?? '🥬'} className="h-14 w-14 shrink-0 rounded-xl text-xl" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-bold">{item.name}</p>
                      <p className="text-sm text-ink-mute">{item.category} · {formatTZS(item.retail_price)}/{item.unit}</p>
                      {stocked && <p className="text-xs font-bold text-leaf-deep">Already stocked: {formatNum(Number(listing?.stock))} {item.unit}</p>}
                      {stocked && !available && <p className="text-xs font-bold text-[#8A5A00]">Hidden from the shop</p>}
                      {!item.price_approved && <p className="text-xs font-bold text-[#8A5A00]">Waiting for price approval</p>}
                    </div>
                    {available ? (
                      <span className="shrink-0 rounded-full bg-leaf-soft px-3 py-1.5 text-xs font-extrabold text-leaf-deep">Stocked</span>
                    ) : stocked && item.price_approved ? (
                      <Button size="sm" variant="soft" disabled={stockCatalogBusyId === item.id || stockCatalogLoading} onClick={() => { void publishSharedProduct(item); }}>
                        {stockCatalogBusyId === item.id ? 'Saving…' : 'Show in shop'}
                      </Button>
                    ) : !item.price_approved ? (
                      <Button size="sm" variant="soft" disabled>Price review</Button>
                    ) : (
                      <Button size="sm" variant="soft" disabled={stockCatalogBusyId === item.id || stockCatalogLoading} onClick={() => { void addSharedStock(item); }}>
                        {stockCatalogBusyId === item.id ? 'Adding…' : 'Add 10'}
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {visible.length === 0 ? (
        <EmptyState icon={<PackagePlus size={36} />} title="No products yet" hint={canEdit ? 'Add your first product and it appears in the shop as soon as it has stock.' : 'Nothing matches your search.'} action={canEdit ? <Button onClick={() => openForm('new')} icon={<Plus size={20} />}>Add product</Button> : undefined} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((p, i) => {
            const low = isLow(p);
            const ratio = Math.min(1, p.stock / Math.max(1, p.lowStockAt * 3));
            return (
              <motion.article key={p.id} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 9) * 0.035 }} className={cn('overflow-hidden rounded-[1.75rem] border border-line bg-white shadow-soft', !p.active && 'opacity-75')}>
                <div className="relative">
                  <SmartImage src={p.image} alt={p.name} emoji={p.emoji} className="aspect-[16/10] w-full text-5xl" />
                  {!p.active && <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-ink/80 px-3 py-1 text-sm font-bold text-white"><EyeOff size={15} /> Hidden from shop</span>}
                  {low && p.active && <span className="absolute left-3 top-3 rounded-full bg-sun px-3 py-1 text-sm font-extrabold text-ink">Running low</span>}
                </div>
                <div className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate font-display text-xl font-extrabold">{p.name}</h3>
                      <p className="text-sm text-ink-mute">{p.category}{!farmId && ` · ${farmName.get(p.supplierId)}`}</p>
                    </div>
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-3">
                    <div className="rounded-2xl bg-leaf-soft p-3">
                      <dt className="text-xs font-semibold text-leaf-deep">Shop price</dt>
                      <dd className="font-extrabold text-leaf-deep">{formatTZS(p.retailPrice)}<span className="text-xs font-medium">/{p.unit}</span></dd>
                    </div>
                    <div className="rounded-2xl bg-sun-soft p-3">
                      <dt className="text-xs font-semibold text-[#8A5A00]">Bulk price (min {p.wholesaleMinQty})</dt>
                      <dd className="font-extrabold text-[#6B4A12]">{formatTZS(p.wholesalePrice)}<span className="text-xs font-medium">/{p.unit}</span></dd>
                    </div>
                  </dl>
                  <div className="mt-4">
                    <div className="flex items-baseline justify-between">
                      <span className="text-sm font-semibold text-ink-mute">In stock</span>
                      <span className={cn('font-extrabold', low ? 'text-[#C62828]' : 'text-ink')}>{formatNum(p.stock)} {p.unit}</span>
                    </div>
                    <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-line">
                      <motion.div initial={{ width: 0 }} animate={{ width: `${Math.max(4, ratio * 100)}%` }} transition={{ duration: 0.8 }} className="h-full rounded-full" style={{ backgroundColor: low ? '#FFB300' : '#4CAF50' }} />
                    </div>
                  </div>
                  {(canEdit || canStock) && (
                    <div className="mt-4 flex gap-2">
                      {canStock && <Button size="sm" variant="soft" className="flex-1" icon={<PackagePlus size={17} />} onClick={() => setRestockId(p.id)}>Add stock</Button>}
                      {canEdit && <Button size="sm" variant="ghost" className="flex-1" icon={<Pencil size={17} />} onClick={() => openForm(p)}>Edit</Button>}
                    </div>
                  )}
                </div>
              </motion.article>
            );
          })}
        </div>
      )}

      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'Add a product' : 'Edit product'} wide>
        <div className="space-y-4">
          <Field label="Product name" error={errors.name}><Input value={form.name} onChange={set('name')} placeholder="Vine Tomatoes" /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Type"><Select value={form.category} onChange={set('category')}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</Select></Field>
            <Field label="Sold by"><Select value={form.unit} onChange={set('unit')}>{UNITS.map((c) => <option key={c}>{c}</option>)}</Select></Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Suggested shop price (TSh)" error={errors.retail} hint="Shared customer prices require Saplaya approval"><Input type="number" inputMode="numeric" value={form.retail} onChange={set('retail')} /></Field>
            <Field label="Suggested bulk price (TSh)" error={errors.wholesale} hint="A lower bulk price; submitted for central review"><Input type="number" inputMode="numeric" value={form.wholesale} onChange={set('wholesale')} /></Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Smallest bulk order" error={errors.min}><Input type="number" inputMode="numeric" value={form.min} onChange={set('min')} /></Field>
            <Field label="Warn me when stock falls to" hint="You get a Running low alert"><Input type="number" inputMode="numeric" value={form.low} onChange={set('low')} /></Field>
          </div>
          {editing === 'new' && <Field label="Stock you have now" hint="You can add more later with Add stock"><Input type="number" inputMode="decimal" value={form.opening} onChange={set('opening')} /></Field>}
          <Field label="Photo link (optional)" hint="Paste a link to a bright, clear photo. Leave empty to use a coloured tile."><Input value={form.image} onChange={set('image')} placeholder="https://" /></Field>
          <label className="flex cursor-pointer items-center gap-3 rounded-2xl bg-milk p-4">
            <input type="checkbox" checked={form.active} onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))} className="h-6 w-6 accent-[#2E7D32]" />
            <span className="font-semibold">Show this product in the Saplaya shop</span>
          </label>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={() => { void save(); }}>{editing === 'new' ? 'Add product' : 'Save changes'}</Button>
          </div>
        </div>
      </Modal>

      <RestockModal open={restockId !== null} onClose={() => setRestockId(null)} products={products.filter((p) => p.active || p.id === restockId)} productId={restockId ?? undefined} />
    </>
  );
}

export default function ProductsPage() {
  return (
    <Guarded perm="products.view">
      <Products />
    </Guarded>
  );
}
