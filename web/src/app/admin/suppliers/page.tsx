'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { Check, Mail, MapPin, Pause, Phone, Play, Plus, Sprout, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Guarded, PageHeader } from '@/components/admin/Guard';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/Bits';
import { Field, Input, Select } from '@/components/ui/Fields';
import { Modal } from '@/components/ui/Modal';
import { cn, formatTZS, timeAgo } from '@/lib/format';
import { can } from '@/lib/roles';
import { countsAsSale, orderTotal } from '@/lib/stats';
import { useDB, useScope, useToast } from '@/lib/store';
import type { Supplier, SupplierStatus } from '@/lib/types';

const FARM_STATUS: Record<SupplierStatus, { label: string; cls: string }> = {
  active: { label: 'Selling', cls: 'bg-leaf-soft text-leaf-deep' },
  pending: { label: 'Waiting', cls: 'bg-sun-soft text-[#8A5A00]' },
  suspended: { label: 'Paused', cls: 'bg-[#FFEBEE] text-[#B71C1C]' },
};
function Farms() {
  const { me, suppliers, products, orders } = useScope();
  const applications = useDB((s) => s.applications);
  const decide = useDB((s) => s.decideApplication);
  const setSupplierStatus = useDB((s) => s.setSupplierStatus);
  const setSupplierCoordinates = useDB((s) => s.setSupplierCoordinates);
  const addSupplier = useDB((s) => s.addSupplier);
  const push = useToast((s) => s.push);

  const [tab, setTab] = useState<'farms' | 'applications'>('farms');
  const [adding, setAdding] = useState(false);
  const [toggle, setToggle] = useState<Supplier | null>(null);
  const [locationEditing, setLocationEditing] = useState<Supplier | null>(null);
  const [coordinates, setCoordinates] = useState({ latitude: '', longitude: '' });
  const [form, setForm] = useState({ name: '', region: '', contactName: '', contactEmail: '', contactPhone: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (window.location.hash === '#applications') setTab('applications');
  }, []);

  const stats = useMemo(
    () =>
      new Map(
        suppliers.map((s) => {
          const mine = orders.filter((o) => o.supplierId === s.id);
          return [s.id, {
            products: products.filter((p) => p.supplierId === s.id).length,
            open: mine.filter((o) => o.status === 'pending' || o.status === 'packing').length,
            sales: mine.filter(countsAsSale).reduce((n, o) => n + orderTotal(o), 0),
          }];
        })
      ),
    [suppliers, products, orders]
  );

  if (!me) return null;
  const canManage = can(me.role, 'suppliers.manage', me.permissions);
  const newApps = applications.filter((a) => a.status === 'new').length;
  const sorted = [...applications].sort((a, b) => (a.status === 'new' ? -1 : 1) - (b.status === 'new' ? -1 : 1) || b.at - a.at);

  async function saveFarm() {
    const err: Record<string, string> = {};
    if (form.name.trim().length < 2) err.name = 'Enter the farm name.';
    if (form.region.trim().length < 2) err.region = 'Enter a country or region.';
    if (form.contactName.trim().length < 2) err.contactName = 'Enter the owner’s name.';
    if (!/^\S+@\S+\.\S+$/.test(form.contactEmail)) err.contactEmail = 'Check the email address. We send the sign-in link here.';
    if (form.contactPhone.trim().length < 9) err.contactPhone = 'Enter a phone number.';
    setErrors(err);
    if (Object.keys(err).length) return;
    try {
      await addSupplier({ ...form, name: form.name.trim(), contactName: form.contactName.trim(), contactEmail: form.contactEmail.trim() });
      push(`${form.name.trim()} was added. A sign-in link was sent to ${form.contactEmail.trim()}.`);
      setForm({ name: '', region: '', contactName: '', contactEmail: '', contactPhone: '' });
      setAdding(false);
    } catch (error) {
      push(error instanceof Error ? error.message : 'Could not add this farm.', 'bad');
    }
  }

  async function saveCoordinates() {
    if (!locationEditing) return;
    const latitude = Number(coordinates.latitude);
    const longitude = Number(coordinates.longitude);
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      push('Enter a valid farm latitude and longitude.', 'bad');
      return;
    }
    try {
      await setSupplierCoordinates(locationEditing.id, latitude, longitude);
      push(`GPS coordinates saved for ${locationEditing.name}.`);
      setLocationEditing(null);
    } catch (error) {
      push(error instanceof Error ? error.message : 'Could not save farm coordinates.', 'bad');
    }
  }

  async function decideApplication(id: string, decision: 'approved' | 'rejected', farmName: string, email: string) {
    try {
      const invitedEmail = await decide(id, decision);
      push(decision === 'approved'
        ? `${farmName} is approved. A sign-in link was sent to ${invitedEmail ?? email}.`
        : `${farmName} was declined.`, decision === 'approved' ? 'good' : 'info');
    } catch (error) {
      push(error instanceof Error ? error.message : 'Could not update this application.', 'bad');
    }
  }

  async function toggleSupplier() {
    if (!toggle) return;
    const next = toggle.status === 'suspended' ? 'active' : 'suspended';
    try {
      await setSupplierStatus(toggle.id, next);
      push(next === 'active' ? `${toggle.name} is selling again.` : `${toggle.name} is paused.`, next === 'active' ? 'good' : 'info');
      setToggle(null);
    } catch (error) {
      push(error instanceof Error ? error.message : 'Could not update this farm.', 'bad');
    }
  }

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <>
      <PageHeader
        title="Farms"
        subtitle="The farms that supply Saplaya. Customers never see farm names. They see one Saplaya shop."
        actions={canManage ? <Button icon={<Plus size={20} />} onClick={() => setAdding(true)}>Add a farm</Button> : undefined}
      />

      <div className="mb-6 inline-flex rounded-full bg-white p-1.5 shadow-soft ring-1 ring-line" role="tablist">
        {([['farms', `Farms (${suppliers.length})`], ['applications', 'Applications']] as const).map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={cn('relative rounded-full px-5 py-2.5 text-[15px] font-bold transition', tab === id ? 'text-white' : 'text-ink-soft')}>
            {tab === id && <motion.span layoutId="farm-tab" className="absolute inset-0 rounded-full bg-leaf" transition={{ type: 'spring', damping: 26, stiffness: 340 }} />}
            <span className="relative flex items-center gap-2">
              {label}
              {id === 'applications' && newApps > 0 && <span className="rounded-full bg-sun px-2 text-sm font-extrabold text-ink">{newApps}</span>}
            </span>
          </button>
        ))}
      </div>

      {tab === 'farms' ? (
        <div className="grid gap-4 md:grid-cols-2">
          {suppliers.map((s, i) => {
            const st = stats.get(s.id)!;
            const meta = FARM_STATUS[s.status];
            return (
              <motion.article key={s.id} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="rounded-[1.75rem] border border-line bg-white p-5 shadow-soft">
                <div className="flex items-start gap-4">
                  <span className="grid h-16 w-16 shrink-0 place-items-center rounded-3xl bg-leaf-soft text-3xl">{s.emoji}</span>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-display text-xl font-extrabold">{s.name}</h3>
                    <p className="flex items-center gap-1.5 text-ink-mute"><MapPin size={15} /> {s.region}</p>
                  </div>
                  <span className={cn('rounded-full px-3 py-1 text-sm font-bold', meta.cls)}>{meta.label}</span>
                </div>
                <dl className="mt-4 grid grid-cols-3 gap-3 text-center">
                  <div className="rounded-2xl bg-milk p-3"><dd className="font-display text-xl font-extrabold">{st.products}</dd><dt className="text-xs font-semibold text-ink-mute">Products</dt></div>
                  <div className="rounded-2xl bg-milk p-3"><dd className="font-display text-xl font-extrabold">{st.open}</dd><dt className="text-xs font-semibold text-ink-mute">Open orders</dt></div>
                  <div className="rounded-2xl bg-milk p-3"><dd className="font-display text-base font-extrabold leading-7">{formatTZS(st.sales)}</dd><dt className="text-xs font-semibold text-ink-mute">Sales, 14 days</dt></div>
                </dl>
                <div className="mt-4 space-y-1 text-[15px] text-ink-soft">
                  <p className="font-semibold text-ink">{s.contactName}</p>
                  <p className="flex items-center gap-2"><Phone size={15} /> {s.contactPhone}</p>
                  <p className="flex items-center gap-2"><Mail size={15} /> {s.contactEmail}</p>
                </div>
                {canManage && (
                  <div className="mt-4">
                    <p className="mb-2 text-sm text-ink-mute">
                      GPS: {s.latitude === null || s.longitude === null ? 'Not configured — products are not location-matched' : `${s.latitude.toFixed(5)}, ${s.longitude.toFixed(5)}`}
                    </p>
                    <Button
                      size="sm"
                      variant="soft"
                      icon={<MapPin size={16} />}
                      onClick={() => {
                        setCoordinates({
                          latitude: s.latitude === null ? '' : String(s.latitude),
                          longitude: s.longitude === null ? '' : String(s.longitude),
                        });
                        setLocationEditing(s);
                      }}
                    >
                      Set farm GPS
                    </Button>
                    <Button size="sm" variant={s.status === 'suspended' ? 'soft' : 'danger'} icon={s.status === 'suspended' ? <Play size={16} /> : <Pause size={16} />} onClick={() => setToggle(s)}>
                      {s.status === 'suspended' ? 'Let this farm sell again' : 'Pause this farm'}
                    </Button>
                  </div>
                )}
              </motion.article>
            );
          })}
        </div>
      ) : sorted.length === 0 ? (
        <EmptyState icon={<Sprout size={36} />} title="No applications yet" hint="When a farm fills in the Become a supplier form on the website, it shows up here." />
      ) : (
        <ul className="space-y-3">
          <AnimatePresence initial={false}>
            {sorted.map((a) => (
              <motion.li key={a.id} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className={cn('rounded-3xl border bg-white p-5 shadow-soft', a.status === 'new' ? 'border-sun-deep/50' : 'border-line')}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-display text-xl font-extrabold">{a.farmName}</h3>
                    <p className="text-ink-soft">{a.contactName} · {a.region} · {a.farmSize}</p>
                    <p className="mt-1 text-ink-soft">Grows: <b className="text-ink">{a.produce}</b></p>
                    <p className="mt-1 text-sm text-ink-mute">{a.phone} · {a.email} · applied {timeAgo(a.at)}</p>
                  </div>
                  {a.status === 'new' ? (
                    canManage && (
                      <div className="flex gap-2">
                        <Button variant="danger" size="sm" icon={<X size={17} />} onClick={() => { void decideApplication(a.id, 'rejected', a.farmName, a.email); }}>Decline</Button>
                        <Button size="sm" icon={<Check size={17} />} onClick={() => { void decideApplication(a.id, 'approved', a.farmName, a.email); }}>Approve</Button>
                      </div>
                    )
                  ) : (
                    <span className={cn('rounded-full px-3 py-1 text-sm font-bold', a.status === 'approved' ? 'bg-leaf-soft text-leaf-deep' : 'bg-[#FFEBEE] text-[#B71C1C]')}>{a.status === 'approved' ? 'Approved' : 'Declined'}</span>
                  )}
                </div>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}

      <Modal open={adding} onClose={() => setAdding(false)} title="Add a farm">
        <div className="space-y-4">
          <p className="text-ink-soft">We create the farm and email the owner a link to set up their sign-in.</p>
          <Field label="Farm name" error={errors.name}><Input value={form.name} onChange={set('name')} /></Field>
          <Field label="Country or region" error={errors.region}><Input value={form.region} onChange={set('region')} placeholder="Country, state, or region" autoComplete="address-level1" /></Field>
          <Field label="Owner's name" error={errors.contactName}><Input value={form.contactName} onChange={set('contactName')} /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Owner's email" error={errors.contactEmail}><Input type="email" value={form.contactEmail} onChange={set('contactEmail')} /></Field>
            <Field label="Owner's phone" error={errors.contactPhone}><Input value={form.contactPhone} onChange={set('contactPhone')} inputMode="tel" /></Field>
          </div>
          <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setAdding(false)}>Cancel</Button><Button onClick={() => { void saveFarm(); }}>Add farm</Button></div>
        </div>
      </Modal>

      <Modal open={!!locationEditing} onClose={() => setLocationEditing(null)} title={`Farm GPS${locationEditing ? ` · ${locationEditing.name}` : ''}`}>
        <div className="space-y-4">
          <p className="text-sm text-ink-soft">Enter the farm’s verified decimal coordinates. The customer app uses them for nearest-farm matching and delivery distance; farm identity remains private.</p>
          <Field label="Latitude"><Input type="number" step="any" value={coordinates.latitude} onChange={(event) => setCoordinates((current) => ({ ...current, latitude: event.target.value }))} placeholder="-6.1630" /></Field>
          <Field label="Longitude"><Input type="number" step="any" value={coordinates.longitude} onChange={(event) => setCoordinates((current) => ({ ...current, longitude: event.target.value }))} placeholder="35.7516" /></Field>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setLocationEditing(null)}>Cancel</Button>
            <Button onClick={() => { void saveCoordinates(); }}>Save GPS</Button>
          </div>
        </div>
      </Modal>

      <Modal open={!!toggle} onClose={() => setToggle(null)} title={toggle?.status === 'suspended' ? 'Let this farm sell again?' : 'Pause this farm?'}>
        {toggle && (
          <div className="space-y-4">
            <p className="text-lg text-ink-soft">
              {toggle.status === 'suspended'
                ? <><b className="text-ink">{toggle.name}</b> can sign in again and its products return to the shop.</>
                : <>Its products disappear from the shop and nobody at <b className="text-ink">{toggle.name}</b> can sign in. Existing orders are not cancelled.</>}
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setToggle(null)}>Not now</Button>
              <Button variant={toggle.status === 'suspended' ? 'primary' : 'danger'} onClick={() => { void toggleSupplier(); }}>
                {toggle.status === 'suspended' ? 'Yes, let them sell' : 'Yes, pause'}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}

export default function FarmsPage() {
  return (
    <Guarded perm="suppliers.view_all">
      <Farms />
    </Guarded>
  );
}
