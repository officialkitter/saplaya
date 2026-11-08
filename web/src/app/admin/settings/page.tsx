'use client';

import { Save } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Guarded, PageHeader, Panel } from '@/components/admin/Guard';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Fields';
import { formatTZS } from '@/lib/format';
import { deliveryFee } from '@/lib/stats';
import { useDB, useToast } from '@/lib/store';
import { DELIVERY_ETAS, type DeliveryEta } from '@/lib/types';

function SettingsPage() {
  const saved = useDB((s) => s.settings);
  const saveSettings = useDB((s) => s.saveSettings);
  const push = useToast((s) => s.push);

  const [f, setF] = useState({ ...saved });
  const [km, setKm] = useState(3);
  const [saving, setSaving] = useState(false);
  useEffect(() => setF({ ...saved }), [saved]);

  const num = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((p) => ({ ...p, [k]: Number(e.target.value) }));
  const setDeliveryFee = (eta: DeliveryEta, value: string) => {
    const fee = value === '' ? null : Number(value);
    setF((previous) => ({
      ...previous,
      deliveryOptionFees: { ...previous.deliveryOptionFees, [eta]: fee },
    }));
  };
  const setTierPercentage = (tier: keyof typeof f.tierPricePercentages, value: string) => {
    setF((previous) => ({
      ...previous,
      tierPricePercentages: { ...previous.tierPricePercentages, [tier]: Number(value) },
    }));
  };
  const fee = deliveryFee(km, f);
  const valid = f.freeRadiusKm >= 0 && f.midRadiusKm > f.freeRadiusKm && f.midFee >= 0 && f.farFee >= f.midFee && f.commissionPct >= 0 && f.commissionPct <= 40
    && f.tierPricePercentages.wholesale > f.tierPricePercentages.bulk
    && f.tierPricePercentages.bulk > f.tierPricePercentages.mega_bulk
    && Object.values(f.tierPricePercentages).every((percent) => Number.isFinite(percent) && percent >= 1 && percent <= 99)
    && Object.values(f.deliveryOptionFees).every((price) => price === null || (Number.isSafeInteger(price) && price >= 0));

  async function save() {
    setSaving(true);
    try {
      await saveSettings(f);
      push('Settings saved.');
    } catch (error) {
      push(error instanceof Error ? error.message : 'Could not save settings.', 'bad');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader title="Settings" subtitle="Price tiers, delivery rules, and what Saplaya keeps from each sale. Only authorized owners and administrators can change these." />
      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <Panel title="Automatic volume pricing" subtitle="All tiers are calculated from the retail price, rounded to the nearest TZS, and applied to approved prices when these rules change.">
          <div className="grid gap-4 sm:grid-cols-3">
            {([
              ['wholesale', 'Wholesale'],
              ['bulk', 'Bulk'],
              ['mega_bulk', 'Mega-bulk'],
            ] as const).map(([tier, label]) => (
              <Field
                key={tier}
                label={`${label} · ${f.tierPricePercentages[tier]}% of retail`}
                error={tier === 'wholesale' && f.tierPricePercentages.wholesale <= f.tierPricePercentages.bulk
                  ? 'Wholesale must exceed the bulk percentage.'
                  : tier === 'bulk' && f.tierPricePercentages.bulk <= f.tierPricePercentages.mega_bulk
                    ? 'Bulk must exceed the mega-bulk percentage.'
                    : undefined}
              >
                <Input
                  type="number"
                  min={1}
                  max={99}
                  step="0.1"
                  value={f.tierPricePercentages[tier]}
                  onChange={(event) => setTierPercentage(tier, event.target.value)}
                />
              </Field>
            ))}
          </div>
          <p className="mt-4 rounded-xl bg-leaf-soft p-3 text-sm text-leaf-deep">
            At the default rates, wholesale is 70% of retail, bulk is 65%, and mega-bulk is 55%.
          </p>
        </Panel>
        <Panel title="Delivery prices" subtitle="The app and the server use these tiers to price every order.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Free delivery up to (km)"><Input type="number" min={0} value={f.freeRadiusKm} onChange={num('freeRadiusKm')} /></Field>
            <Field label="Standard delivery up to (km)" error={f.midRadiusKm <= f.freeRadiusKm ? 'Must be larger than the free distance.' : undefined}><Input type="number" min={0} value={f.midRadiusKm} onChange={num('midRadiusKm')} /></Field>
            <Field label="Standard delivery price (TSh)"><Input type="number" min={0} value={f.midFee} onChange={num('midFee')} /></Field>
            <Field label="Far delivery price (TSh)" error={f.farFee < f.midFee ? 'Should not be less than the standard price.' : undefined}><Input type="number" min={0} value={f.farFee} onChange={num('farFee')} /></Field>
          </div>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <Field label="Saplaya keeps (% of each sale)" error={f.commissionPct > 40 ? 'Keep this under 40%.' : undefined}><Input type="number" min={0} max={40} value={f.commissionPct} onChange={num('commissionPct')} /></Field>
            <Field label="Smallest bulk order for new products"><Input type="number" min={1} value={f.wholesaleMinDefault} onChange={num('wholesaleMinDefault')} /></Field>
          </div>
          <div className="mt-6 flex justify-end">
            <Button icon={<Save size={20} />} disabled={!valid || saving} onClick={() => { void save(); }}>{saving ? 'Saving…' : 'Save settings'}</Button>
          </div>
        </Panel>

        <Panel title="Bulk delivery timeframes" subtitle="Configure timeframes for bulk and mega-bulk orders.">
          <div className="grid gap-4 sm:grid-cols-2">
            {DELIVERY_ETAS.filter((option) => option.value !== 'morning' && option.value !== 'evening').map((option) => (
              <Field key={option.value} label={`${option.title} surcharge (TZS)`}>
                <Input
                  type="number"
                  min={0}
                  step={1}
                  value={f.deliveryOptionFees[option.value] ?? ''}
                  onChange={(event) => setDeliveryFee(option.value, event.target.value)}
                  placeholder="Not available"
                />
              </Field>
            ))}
          </div>
          <div className="mt-6 flex justify-end">
            <Button icon={<Save size={20} />} disabled={!valid || saving} onClick={() => { void save(); }}>{saving ? 'Saving…' : 'Save delivery prices'}</Button>
          </div>
        </Panel>

        <div className="space-y-6">
          <Panel title="Try a customer" subtitle={`Distance from ${f.hubName}`}>
            <input type="range" min={0} max={15} step={0.5} value={km} onChange={(e) => setKm(Number(e.target.value))} aria-label="Distance in kilometres" className="h-3 w-full accent-[#2E7D32]" />
            <div className="mt-3 flex items-baseline justify-between">
              <p className="font-display text-2xl font-extrabold">{km} km</p>
              <p className={`font-display text-2xl font-extrabold ${fee === 0 ? 'text-leaf' : 'text-ink'}`}>{fee === 0 ? 'Free delivery' : formatTZS(fee)}</p>
            </div>
            <p className="mt-2 text-sm text-ink-mute">{fee === 0 ? 'The customer sees the cheerful scooter banner in their basket.' : 'The customer sees this price before they order.'}</p>
          </Panel>

        </div>
      </div>
    </>
  );
}

export default function Settings() {
  return (
    <Guarded perm="settings.manage">
      <SettingsPage />
    </Guarded>
  );
}
