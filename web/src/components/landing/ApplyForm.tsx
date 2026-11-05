'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { Check, Loader2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select } from '@/components/ui/Fields';

const SIZES = ['Less than 5 acres', '5 to 20 acres', 'More than 20 acres'];

const empty = { farm: '', name: '', phone: '', email: '', region: '', produce: '', size: SIZES[0] };

export function ApplyForm() {
  const [f, setF] = useState(empty);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [sendError, setSendError] = useState('');

  const set = (k: keyof typeof empty) => (e: { target: { value: string } }) => setF((p) => ({ ...p, [k]: e.target.value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    const err: Record<string, string> = {};
    if (f.farm.trim().length < 2) err.farm = 'Tell us the name of your farm.';
    if (f.name.trim().length < 2) err.name = 'Tell us your name.';
    if (f.phone.trim().length < 9) err.phone = 'Add a phone number we can call.';
    if (!/^\S+@\S+\.\S+$/.test(f.email)) err.email = 'Check your email address. It looks incomplete.';
    if (f.region.trim().length < 2) err.region = 'Enter a country or region.';
    if (f.produce.trim().length < 3) err.produce = 'List a few things you grow.';
    setErrors(err);
    if (Object.keys(err).length) return;

    setBusy(true);
    setSendError('');
    const api = process.env.NEXT_PUBLIC_API_URL;
    if (!api) {
      setBusy(false);
      setSendError('Applications are temporarily unavailable. Please try again later.');
      return;
    }
    try {
      const res = await fetch(`${api.replace(/\/+$/, '')}/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          farm_name: f.farm, contact_name: f.name, email: f.email, phone: f.phone,
          region: f.region, produce: f.produce, farm_size: f.size,
        }),
      });
      if (!res.ok) {
        const result = await res.json() as { error?: unknown };
        throw new Error(typeof result.error === 'string' ? result.error : 'Application request failed.');
      }
    } catch (error) {
      setBusy(false);
      setSendError(error instanceof Error ? error.message : 'We could not send your form. Check your internet and try again.');
      return;
    }
    setBusy(false);
    setDone(true);
  }

  return (
    <div className="rounded-[2rem] bg-white p-6 text-ink shadow-lift sm:p-8">
      <AnimatePresence mode="wait">
        {done ? (
          <motion.div key="done" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="py-6 text-center">
            <motion.div
              initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', damping: 9, stiffness: 160 }}
              className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-leaf text-white"
            >
              <Check size={42} strokeWidth={3} />
            </motion.div>
            <h3 className="mt-5 font-display text-2xl font-extrabold">Thank you, {f.name.split(' ')[0]}.</h3>
            <p className="mx-auto mt-2 max-w-sm text-ink-soft">
              We will call {f.phone} within 2 working days. After we approve {f.farm}, you get an email with your sign-in link.
            </p>
            <Button variant="soft" className="mt-6" onClick={() => { setF(empty); setDone(false); }}>
              Add another farm
            </Button>
          </motion.div>
        ) : (
          <motion.form key="form" onSubmit={submit} noValidate initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
            <div>
              <h3 className="font-display text-2xl font-extrabold">Apply to sell on Saplaya</h3>
              <p className="mt-1 text-ink-soft">Takes about two minutes. No fee to apply.</p>
            </div>
            <Field label="Farm name" error={errors.farm}><Input value={f.farm} onChange={set('farm')} placeholder="Mlimani Farm" autoComplete="organization" /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Your name" error={errors.name}><Input value={f.name} onChange={set('name')} placeholder="Amina Mushi" autoComplete="name" /></Field>
              <Field label="Phone number" error={errors.phone}><Input value={f.phone} onChange={set('phone')} placeholder="+255 7XX XXX XXX" inputMode="tel" autoComplete="tel" /></Field>
            </div>
            <Field label="Email" error={errors.email}><Input type="email" value={f.email} onChange={set('email')} placeholder="you@example.com" autoComplete="email" /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Country or region" error={errors.region}><Input value={f.region} onChange={set('region')} placeholder="Country, state, or region" autoComplete="address-level1" /></Field>
              <Field label="Farm size"><Select value={f.size} onChange={set('size')}>{SIZES.map((r) => <option key={r}>{r}</option>)}</Select></Field>
            </div>
            <Field label="What do you grow?" error={errors.produce} hint="For example: tomatoes, onions, spinach"><Input value={f.produce} onChange={set('produce')} /></Field>
            {sendError && <p role="alert" className="rounded-2xl bg-[#FFEBEE] p-3 font-semibold text-[#B71C1C]">{sendError}</p>}
            <Button type="submit" size="lg" className="w-full" disabled={busy} icon={busy ? <Loader2 className="animate-spin" size={22} /> : undefined}>
              {busy ? 'Sending' : 'Send application'}
            </Button>
          </motion.form>
        )}
      </AnimatePresence>
    </div>
  );
}
