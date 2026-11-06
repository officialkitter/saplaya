'use client';

import { Check, ImagePlus, Pencil, Plus, Search, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Guarded, PageHeader, Panel } from '@/components/admin/Guard';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/Bits';
import { Field, Input } from '@/components/ui/Fields';
import { Modal } from '@/components/ui/Modal';
import { fetchAdmin, getSupabase } from '@/lib/supabase';
import { formatTZS, localDateTime } from '@/lib/format';
import { useMe, useToast } from '@/lib/store';
import { tierPrices } from '@/lib/volume';

type CatalogItem = {
  id: string;
  name: string;
  category: string;
  unit: string;
  retail_price: number;
  wholesale_price: number;
  wholesale_min_qty: number;
  bulk_price?: number | null;
  mega_bulk_price?: number | null;
  image_url: string | null;
  price_approved: boolean;
};

type PriceProposal = {
  id: string;
  catalog_product_id: string;
  product_id: string | null;
  retail_price: number;
  wholesale_price: number;
  created_at: string;
};

type CatalogResponse = { items: CatalogItem[]; proposals: PriceProposal[] };
type Form = Pick<CatalogItem, 'name' | 'category' | 'unit' | 'image_url' | 'price_approved'> & {
  retail_price: string;
  wholesale_price: string;
  wholesale_min_qty: string;
  bulk_price: string;
  mega_bulk_price: string;
};

const blankForm: Form = {
  name: '',
  category: 'Vegetables',
  unit: 'kg',
  image_url: null,
  price_approved: false,
  retail_price: '',
  wholesale_price: '',
  wholesale_min_qty: '10',
  bulk_price: '',
  mega_bulk_price: '',
};

function SharedCatalog() {
  const push = useToast((state) => state.push);
  const me = useMe();
  const [pricingPercentages, setPricingPercentages] = useState({ wholesale: 70, bulk: 65, mega_bulk: 55 });
  const [pricingPolicyReady, setPricingPolicyReady] = useState(false);
  const canViewTierPricing = me?.role === 'platform_owner'
    || (me?.roleScope === 'platform' && ['administrator', 'platform_admin'].includes(me.role));
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [proposals, setProposals] = useState<PriceProposal[]>([]);
  const [query, setQuery] = useState('');
  const [approvalFilter, setApprovalFilter] = useState<'pending' | 'approved'>('pending');
  const [editing, setEditing] = useState<CatalogItem | 'new' | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchAdmin<CatalogResponse>('/admin/catalog');
      setItems(result.items);
      setProposals(result.proposals);
    } catch (error) {
      push(error instanceof Error ? error.message : 'Could not load the shared catalog.', 'bad');
    } finally {
      setLoading(false);
    }
  }, [push]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    void fetchAdmin<typeof pricingPercentages>('/admin/pricing-policy')
      .then((policy) => {
        setPricingPercentages(policy);
        setPricingPolicyReady(true);
      })
      .catch((error: unknown) => {
        push(error instanceof Error ? error.message : 'Could not load automatic pricing rules.', 'bad');
      });
  }, [push]);

  const visible = useMemo(() => {
    const text = query.trim().toLowerCase();
    return items.filter((item) => item.price_approved === (approvalFilter === 'approved')
      && (!text || `${item.name} ${item.category}`.toLowerCase().includes(text)));
  }, [items, query, approvalFilter]);

  const startEdit = (item: CatalogItem) => {
    setEditing(item);
    setForm({
      name: item.name,
      category: item.category,
      unit: item.unit,
      image_url: item.image_url,
      price_approved: item.price_approved,
      retail_price: String(item.retail_price),
      wholesale_price: String(item.wholesale_price),
      wholesale_min_qty: String(item.wholesale_min_qty),
      bulk_price: item.bulk_price == null ? '' : String(item.bulk_price),
      mega_bulk_price: item.mega_bulk_price == null ? '' : String(item.mega_bulk_price),
    });
  };

  const startCreate = () => {
    setEditing('new');
    setForm({ ...blankForm });
  };

  const uploadPhoto = async (file: File | undefined) => {
    if (!file || !form) return;
    if (!file.type.startsWith('image/')) {
      push('Choose an image file.', 'bad');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      push('Choose an image smaller than 5 MB.', 'bad');
      return;
    }
    setUploadingPhoto(true);
    try {
      const extension = file.type.split('/')[1]?.replace('jpeg', 'jpg') || 'jpg';
      const path = `catalog/${crypto.randomUUID()}.${extension}`;
      const { error } = await getSupabase().storage.from('catalog-product-images').upload(path, file, {
        contentType: file.type,
        upsert: false,
      });
      if (error) throw error;
      const { data } = getSupabase().storage.from('catalog-product-images').getPublicUrl(path);
      setForm((current) => current ? { ...current, image_url: data.publicUrl } : current);
      push('Product photo added.');
    } catch (error) {
      push(error instanceof Error ? error.message : 'Could not upload this photo.', 'bad');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const save = async () => {
    if (!editing || !form) return;
    if (!pricingPolicyReady) {
      push('Wait for the owner pricing rules to load before saving.', 'bad');
      return;
    }
    const retail = Number(form.retail_price);
    const prices = tierPrices(retail, pricingPercentages);
    const wholesale = prices.wholesale;
    const minimum = Number(form.wholesale_min_qty);
    const bulkPrice = prices.bulk;
    const megaBulkPrice = prices.mega_bulk;
    if (form.name.trim().length < 2) {
      push('Enter a product name.', 'bad');
      return;
    }
    if (form.category.trim().length < 2 || !form.unit.trim()) {
      push('Enter a category and sales unit.', 'bad');
      return;
    }
    if (!Number.isInteger(retail) || retail < 2 || !Number.isInteger(wholesale) || wholesale <= 0 || wholesale >= retail) {
      push('Set a whole retail price of at least 2 TSh.', 'bad');
      return;
    }
    if (!Number.isInteger(minimum) || minimum <= 0) {
      push('Set a valid wholesale minimum quantity.', 'bad');
      return;
    }
    if (
      !Number.isInteger(bulkPrice) || bulkPrice <= 0 || bulkPrice > wholesale
      || !Number.isInteger(megaBulkPrice) || megaBulkPrice <= 0 || megaBulkPrice > bulkPrice
    ) {
      push('Set a bulk price no higher than wholesale, and a mega-bulk price no higher than bulk.', 'bad');
      return;
    }
    setSaving(true);
    try {
      await fetchAdmin(
        editing === 'new' ? '/admin/catalog' : `/admin/catalog/${encodeURIComponent(editing.id)}`,
        {
        method: editing === 'new' ? 'POST' : 'PATCH',
        body: JSON.stringify({
          ...(editing === 'new' ? { name: form.name.trim() } : {}),
          category: form.category,
          unit: form.unit,
          image_url: form.image_url,
          retail_price: retail,
          wholesale_price: wholesale,
          wholesale_min_qty: minimum,
          bulk_price: bulkPrice,
          mega_bulk_price: megaBulkPrice,
          price_approved: form.price_approved,
        }),
      });
      push(editing === 'new' ? `${form.name.trim()} was added to the shared catalog.` : `${form.name.trim()} shared price was saved.`);
      setEditing(null);
      setForm(null);
      await reload();
    } catch (error) {
      push(error instanceof Error ? error.message : 'Could not save this catalog price.', 'bad');
    } finally {
      setSaving(false);
    }
  };

  const review = async (proposal: PriceProposal, approve: boolean) => {
    setSaving(true);
    try {
      await fetchAdmin(`/admin/catalog-proposals/${encodeURIComponent(proposal.id)}/review`, {
        method: 'POST',
        body: JSON.stringify({ approve }),
      });
      push(approve ? 'The shared price was updated from this proposal.' : 'The price proposal was declined.');
      await reload();
    } catch (error) {
      push(error instanceof Error ? error.message : 'Could not review this proposal.', 'bad');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Shared product catalog"
        subtitle="One admin-approved retail and wholesale price is shared by every farm listing the same product."
        actions={<Button icon={<Plus size={19} />} onClick={startCreate}>Add product</Button>}
      />

      <Panel title="Price requests" subtitle="Supplier requests are reviewed before they change the shared customer price.">
        {proposals.length === 0 ? (
          <p className="rounded-2xl bg-leaf-soft p-4 text-sm font-medium text-leaf-deep">There are no price requests waiting for review.</p>
        ) : (
          <div className="space-y-3">
            {proposals.map((proposal) => {
              const product = items.find((item) => item.id === proposal.catalog_product_id);
              return (
                <div key={proposal.id} className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-line p-4">
                  <div>
                    <p className="font-extrabold">{product?.name ?? 'Catalog item'}</p>
                    <p className="mt-1 text-sm text-ink-mute">
                      Proposed retail {formatTZS(proposal.retail_price)} · wholesale {formatTZS(proposal.wholesale_price)}
                    </p>
                    <p className="mt-1 text-xs text-ink-mute">{localDateTime(proposal.created_at)}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="soft" disabled={saving} onClick={() => void review(proposal, false)} icon={<X size={17} />}>Decline</Button>
                    <Button disabled={saving} onClick={() => void review(proposal, true)} icon={<Check size={17} />}>Approve shared price</Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      <Panel
        className="mt-6"
        title={`${approvalFilter === 'pending' ? 'Needs approval' : 'Approved products'} · ${items.filter((item) => item.price_approved === (approvalFilter === 'approved')).length}`}
        subtitle={approvalFilter === 'pending'
          ? 'These products are not available for farms to list until approved.'
          : 'Farmers can browse these approved products and use the shared details.'}
      >
        <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Filter catalog by approval status">
          {([
            ['pending', 'Needs approval'],
            ['approved', 'Approved'],
          ] as const).map(([filter, label]) => (
            <button
              key={filter}
              type="button"
              aria-pressed={approvalFilter === filter}
              onClick={() => setApprovalFilter(filter)}
              className={`rounded-full px-4 py-2 text-sm font-bold transition ${approvalFilter === filter ? 'bg-leaf text-white' : 'bg-leaf-soft text-leaf-deep hover:bg-leaf-soft/80'}`}
            >
              {label} · {items.filter((item) => item.price_approved === (filter === 'approved')).length}
            </button>
          ))}
        </div>
        <div className="relative mb-4 max-w-lg">
          <Search size={19} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-mute" />
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search products or categories" className="pl-11" aria-label="Search the catalog" />
        </div>
        {loading ? (
          <p className="py-8 text-center text-ink-mute">Loading shared catalog…</p>
        ) : visible.length === 0 ? (
          <EmptyState
            icon={<Search size={36} />}
            title={query ? 'No catalog items found' : `No ${approvalFilter === 'pending' ? 'products need approval' : 'approved products'}`}
            hint={query ? 'Try another product name or category.' : 'Products in the other approval section are kept separate.'}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[740px] text-left text-sm">
              <thead>
                <tr className="border-b border-line text-xs uppercase tracking-wide text-ink-mute">
                  <th className="px-3 py-3">Product</th>
                  <th className="px-3 py-3">Retail</th>
                  <th className="px-3 py-3">Wholesale</th>
                  {canViewTierPricing && <th className="px-3 py-3">Bulk</th>}
                  {canViewTierPricing && <th className="px-3 py-3">Mega-bulk</th>}
                  <th className="px-3 py-3">Approval</th>
                  <th className="px-3 py-3 text-right"> </th>
                </tr>
              </thead>
              <tbody>
                {visible.map((item) => (
                  <tr key={item.id} className="border-b border-line last:border-0">
                    <td className="px-3 py-3">
                      <p className="font-bold">{item.name}</p>
                      <p className="text-xs text-ink-mute">{item.category} · per {item.unit}</p>
                    </td>
                    <td className="px-3 py-3 font-semibold">{formatTZS(item.retail_price)}</td>
                    <td className="px-3 py-3 font-semibold">{formatTZS(item.wholesale_price)}</td>
                    {canViewTierPricing && <td className="px-3 py-3 font-semibold">{item.bulk_price == null ? 'Not set' : formatTZS(item.bulk_price)}</td>}
                    {canViewTierPricing && <td className="px-3 py-3 font-semibold">{item.mega_bulk_price == null ? 'Not set' : formatTZS(item.mega_bulk_price)}</td>}
                    <td className="px-3 py-3">
                      <span className={`rounded-full px-3 py-1 text-xs font-extrabold ${item.price_approved ? 'bg-leaf-soft text-leaf-deep' : 'bg-sun-soft text-sun-deep'}`}>
                        {item.price_approved ? 'Approved' : 'Needs approval'}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <Button variant="soft" onClick={() => startEdit(item)} icon={<Pencil size={16} />}>Edit</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Modal open={!!editing && !!form} onClose={() => { setEditing(null); setForm(null); }} title={editing === 'new' ? 'Add catalog product' : editing ? `Edit ${editing.name}` : 'Catalog product'}>
        {form && (
          <div className="space-y-4">
            <Field label="Product name"><Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Tomatoes" /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Category"><Input value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} /></Field>
              <Field label="Unit"><Input value={form.unit} onChange={(event) => setForm({ ...form, unit: event.target.value })} /></Field>
              <Field label="Retail price (TZS)"><Input type="number" min="1" value={form.retail_price} onChange={(event) => setForm({ ...form, retail_price: event.target.value })} /></Field>
              <Field label={`Wholesale · ${pricingPercentages.wholesale}% of retail`}><Input value={formatTZS(tierPrices(Number(form.retail_price), pricingPercentages).wholesale)} readOnly /></Field>
              <Field label="Wholesale minimum quantity"><Input type="number" min="1" value={form.wholesale_min_qty} onChange={(event) => setForm({ ...form, wholesale_min_qty: event.target.value })} /></Field>
              {canViewTierPricing && (
                <>
                  <Field label={`Bulk · ${pricingPercentages.bulk}% of retail`}><Input value={formatTZS(tierPrices(Number(form.retail_price), pricingPercentages).bulk)} readOnly /></Field>
                  <Field label={`Mega-bulk · ${pricingPercentages.mega_bulk}% of retail`}><Input value={formatTZS(tierPrices(Number(form.retail_price), pricingPercentages).mega_bulk)} readOnly /></Field>
                </>
              )}
            </div>
            <div className="rounded-2xl border border-line p-4">
              <div className="flex flex-wrap items-center gap-4">
                {form.image_url && (
                  <img src={form.image_url} alt={`${form.name || 'Product'} preview`} className="h-20 w-20 rounded-xl object-cover" />
                )}
                <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl bg-leaf-soft px-4 py-2 font-bold text-leaf-deep hover:bg-leaf-soft/80">
                  <ImagePlus size={18} />
                  <span>{uploadingPhoto ? 'Adding photo…' : form.image_url ? 'Change photo' : 'Add photo'}</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/heic"
                    capture="environment"
                    className="sr-only"
                    disabled={uploadingPhoto}
                    onChange={(event) => {
                      void uploadPhoto(event.currentTarget.files?.[0]);
                      event.currentTarget.value = '';
                    }}
                  />
                </label>
                {form.image_url && <Button variant="ghost" onClick={() => setForm({ ...form, image_url: null })}>Remove photo</Button>}
              </div>
              <p className="mt-2 text-xs text-ink-mute">JPG, PNG, WebP or HEIC · up to 5 MB. On supported phones this opens the camera or photo library.</p>
            </div>
            <label className="flex items-start gap-3 rounded-2xl bg-leaf-soft p-4 text-sm font-semibold text-leaf-deep">
              <input type="checkbox" checked={form.price_approved} onChange={(event) => setForm({ ...form, price_approved: event.target.checked })} className="mt-0.5 accent-leaf" />
              Approve this price for all farms and eligible customer listings
            </label>
            <div className="flex justify-end gap-2">
              <Button variant="soft" onClick={() => { setEditing(null); setForm(null); }}>Cancel</Button>
              <Button disabled={saving || uploadingPhoto || !pricingPolicyReady} onClick={() => void save()}>{saving ? 'Saving…' : editing === 'new' ? 'Add product' : 'Save shared price'}</Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}

export default function CatalogPage() {
  return (
    <Guarded perm="catalog.manage">
      <SharedCatalog />
    </Guarded>
  );
}
