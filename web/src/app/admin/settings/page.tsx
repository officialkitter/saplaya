'use client';

import { userFacingMessage } from '@/lib/user-facing-error';
import { Save } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Guarded, PageHeader, Panel } from '@/components/admin/Guard';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Fields';
import { CurrencyInput } from '@/components/ui/CurrencyInput';
import { useGlobalMarket } from '@/lib/global-market';
import { deliveryFee } from '@/lib/stats';
import { useDB, useToast } from '@/lib/store';
import { fetchAdmin } from '@/lib/supabase';
import { DELIVERY_ETAS, type DeliveryEta } from '@/lib/types';

type GatewayStatus = {
  mode: 'explicit' | 'legacy';
  environment: 'live' | 'test';
  web_return_configured: boolean;
  providers: { id: string; label: string; methods: string[]; currencies: string[]; ready: boolean; reason?: string }[];
};

function PaymentGatewayPanel() {
  const [status, setStatus] = useState<GatewayStatus | null>(null);
  const [error, setError] = useState('');
  const [notificationBusy, setNotificationBusy] = useState(false);
  const [notificationMessage, setNotificationMessage] = useState('');
  useEffect(() => {
    let active = true;
    fetchAdmin<GatewayStatus>('/admin/payments/gateway-status')
      .then((result) => { if (active) setStatus(result); })
      .catch((cause) => { if (active) setError(userFacingMessage(cause, 'Could not load payment gateway status.')); });
    return () => { active = false; };
  }, []);

  async function verifyPaymentNotifications() {
    setNotificationBusy(true);
    setError('');
    setNotificationMessage('');
    try {
      const result = await fetchAdmin<{ already_registered: boolean; replaced: boolean }>(
        '/admin/payments/pesapal/register-ipn',
        { method: 'POST' },
      );
      setNotificationMessage(result.replaced
        ? 'Payment notifications are now connected to the current backend.'
        : result.already_registered
          ? 'Payment notifications are already connected to the current backend.'
          : 'Payment notifications are registered for this backend.');
      setStatus(await fetchAdmin<GatewayStatus>('/admin/payments/gateway-status'));
    } catch (cause) {
      setError(userFacingMessage(cause, 'Could not verify payment notifications.'));
    } finally {
      setNotificationBusy(false);
    }
  }

  return (
    <Panel title="Payment gateway" subtitle="Providers, currencies and keys are set on the server. Secrets are never shown here.">
      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {!status && !error && <p className="text-sm text-ink-mute">Checking payment providers…</p>}
      {status && (
        <div className="space-y-3">
          <p className="flex flex-wrap gap-2 text-xs font-bold">
            <span className={`rounded-full px-3 py-1 ${status.environment === 'live' ? 'bg-leaf-soft text-leaf-deep' : 'bg-amber-100 text-amber-900'}`}>
              {status.environment === 'live' ? 'Live configuration' : 'Test mode'}
            </span>
            {!status.web_return_configured && <span className="rounded-full bg-red-50 px-3 py-1 text-red-800">Web return URL missing</span>}
          </p>
          {status.providers.length === 0 && <p className="text-sm text-ink-mute">No online payment provider is configured. Customers can only pay on delivery.</p>}
          <ul className="space-y-2">
            {status.providers.map((provider, index) => (
              <li key={provider.id} className="rounded-xl border border-line p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-bold">{index + 1}. {provider.label}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${provider.ready ? 'bg-leaf-soft text-leaf-deep' : 'bg-red-50 text-red-800'}`}>
                    {provider.ready ? 'Configured' : 'Not ready'}
                  </span>
                </div>
                <p className="mt-1 break-words text-xs text-ink-mute">{provider.currencies.join(', ')} · {provider.methods.join(' · ')}</p>
                {provider.reason && <p className="mt-1 text-xs text-red-800">{provider.reason}</p>}
              </li>
            ))}
          </ul>
          <p className="text-xs text-ink-mute">Checkout uses the first ready provider that accepts the customer&apos;s currency unless the customer picks another.</p>
          <p className="text-xs text-ink-mute">Configuration checks do not verify account activation, merchant capabilities or successful payment delivery. Confirm these in each provider&apos;s dashboard before going live.</p>
          {status.providers.some((provider) => provider.id === 'pesapal') && (
            <div className="space-y-2 rounded-xl border border-line bg-white/70 p-3">
              <p className="text-sm font-bold">Payment notifications</p>
              <p className="text-xs leading-5 text-ink-mute">Verify that payment updates are registered to the current public backend. This is required to confirm completed payments.</p>
              <Button type="button" size="sm" onClick={verifyPaymentNotifications} disabled={notificationBusy}>
                {notificationBusy ? 'Verifying…' : 'Verify payment notifications'}
              </Button>
              {notificationMessage && <p role="status" className="text-xs font-semibold text-leaf-deep">{notificationMessage}</p>}
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}

function SettingsPage() {
  const { formatPrice } = useGlobalMarket();
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
      push(userFacingMessage(error, 'Could not save settings.'), 'bad');
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
            <Field label="Standard delivery price"><CurrencyInput min={0} value={f.midFee} onValueChange={(value) => setF((current) => ({ ...current, midFee: Number(value) }))} /></Field>
            <Field label="Far delivery price" error={f.farFee < f.midFee ? 'Should not be less than the standard price.' : undefined}><CurrencyInput min={0} value={f.farFee} onValueChange={(value) => setF((current) => ({ ...current, farFee: Number(value) }))} /></Field>
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
              <Field key={option.value} label={`${option.title} surcharge`}>
                <CurrencyInput
                  min={0}
                  value={f.deliveryOptionFees[option.value] ?? ''}
                  onValueChange={(value) => setDeliveryFee(option.value, value)}
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
              <p className={`font-display text-2xl font-extrabold ${fee === 0 ? 'text-leaf' : 'text-ink'}`}>{fee === 0 ? 'Free delivery' : formatPrice(fee)}</p>
            </div>
            <p className="mt-2 text-sm text-ink-mute">{fee === 0 ? 'The customer sees the cheerful scooter banner in their basket.' : 'The customer sees this price before they order.'}</p>
          </Panel>

          <PaymentGatewayPanel />
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
