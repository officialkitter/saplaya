'use client';

import { motion } from 'framer-motion';
import { ArrowRight, CheckCircle2, Eye, EyeOff, Lock, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Fields';
import { Logo, LogoMark } from '@/components/ui/Logo';
import { getSupabase } from '@/lib/supabase';
import { useBoot, useDB, useMe } from '@/lib/store';
import { loadAdminData } from '@/lib/admin-data';
import type { Role } from '@/lib/types';

const home = (role: Role) => (role === 'driver' ? '/admin/orders' : '/admin');

export default function LoginPage() {
  const router = useRouter();
  const ready = useBoot((s) => s.ready);
  const me = useMe();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [resetMode, setResetMode] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (ready && me) router.replace(home(me.role));
  }, [ready, me, router]);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('passwordReset') === 'success') {
      setNotice('Your password has been updated. Sign in with your new password.');
    }
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { error: authError } = await getSupabase().auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (authError) throw authError;
      const data = await loadAdminData();
      useDB.setState(data);
      const member = useDB.getState().team.find((teamMember) => teamMember.id === useDB.getState().sessionId);
      if (!member) throw new Error('This account does not have access to the Saplaya team portal.');
      router.replace(home(member.role));
    } catch (loginError) {
      console.error('Saplaya team sign-in failed:', loginError);
      await getSupabase().auth.signOut();
      setError('We couldn’t sign in. Check your email and password, then try again.');
    } finally {
      setBusy(false);
    }
  }

  async function sendPasswordReset() {
    if (!email.trim()) {
      setError('Enter your email address to receive a password reset link.');
      return;
    }

    setBusy(true);
    setError('');
    setNotice('');
    try {
      const redirectTo = new URL('/auth/callback?returnTo=%2Flogin', window.location.origin).toString();
      const { error: resetError } = await getSupabase().auth.resetPasswordForEmail(email.trim(), { redirectTo });
      if (resetError) throw resetError;
      setNotice('If an account matches that email, a password reset link is on its way.');
    } catch (resetError) {
      console.error('Saplaya password reset request failed:', resetError);
      setError('We couldn’t send a reset link right now. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[0.9fr_1.1fr]">
      <aside className="field-lines relative hidden overflow-hidden bg-leaf-deep p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <Link href="/" aria-label="Back to Saplaya"><Logo dark grow /></Link>
        <div>
          <motion.div
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', damping: 10, delay: 0.2 }}
            className="mb-8 grid h-24 w-24 place-items-center rounded-[2rem] bg-sun text-leaf-deep"
          >
            <motion.span animate={{ rotate: [-6, 6, -6] }} transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}>
              <LogoMark size={96} />
            </motion.span>
          </motion.div>
          <h1 className="max-w-md font-display text-5xl font-extrabold leading-[1.02] tracking-tight">
            Your farm&rsquo;s orders and stock, in one simple place.
          </h1>
          <ul className="mt-8 max-w-md space-y-3 text-lg text-white/85">
            <li className="flex items-start gap-3"><ShieldCheck className="mt-1 shrink-0 text-sun" size={22} /> Your role controls what you can access.</li>
            <li className="flex items-start gap-3"><Lock className="mt-1 shrink-0 text-sun" size={22} /> Your account details stay protected.</li>
          </ul>
        </div>
        <p className="text-white/60">Saplaya team and farm sign in</p>
      </aside>

      <main className="flex items-center justify-center px-5 py-10 sm:px-10">
        <div className="w-full max-w-xl">
          <Link href="/" className="mb-8 inline-block lg:hidden" aria-label="Back to Saplaya"><Logo /></Link>
          <h2 className="font-display text-4xl font-extrabold tracking-tight">{resetMode ? 'Reset your password' : 'Welcome back'}</h2>
          <p className="mt-1 text-lg text-ink-soft">
            {resetMode ? 'Enter your email and we’ll send you a secure reset link.' : 'Sign in to manage orders, stock and your team.'}
          </p>

          <form onSubmit={(event) => {
            if (resetMode) {
              event.preventDefault();
              void sendPasswordReset();
            } else {
              void submit(event);
            }
          }} className="mt-7 space-y-4" noValidate>
            <Field label="Email">
              <Input type="email" value={email} onChange={(event) => { setEmail(event.target.value); setError(''); setNotice(''); }} placeholder="Enter your email" autoComplete="username" required />
            </Field>
            {!resetMode && <Field label="Password">
              <div className="relative">
                <Input type={show ? 'text' : 'password'} value={password} onChange={(event) => { setPassword(event.target.value); setError(''); }} className="pr-14" autoComplete="current-password" required />
                <button type="button" onClick={() => setShow((value) => !value)} aria-label={show ? 'Hide password' : 'Show password'} className="absolute right-2 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-xl text-ink-soft hover:bg-leaf-soft">
                  {show ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </Field>}
            {!resetMode && (
              <div className="text-right">
                <button type="button" onClick={() => { setResetMode(true); setError(''); setNotice(''); }} className="font-bold text-leaf underline underline-offset-4">
                  Forgot password?
                </button>
              </div>
            )}
            {notice && <p role="status" className="flex items-start gap-2 rounded-2xl bg-leaf-soft p-3 font-semibold text-leaf-deep"><CheckCircle2 size={20} className="mt-0.5 shrink-0" />{notice}</p>}
            {error && <p role="alert" className="rounded-2xl bg-[#FFEBEE] p-3 font-semibold text-[#B71C1C]">{error}</p>}
            <Button type="submit" size="lg" className="w-full" disabled={busy} icon={resetMode ? undefined : <ArrowRight size={22} />}>
              {busy ? (resetMode ? 'Sending link…' : 'Signing in…') : (resetMode ? 'Send reset link' : 'Sign in')}
            </Button>
          </form>

          {resetMode && <p className="mt-5 text-center"><button type="button" onClick={() => { setResetMode(false); setError(''); setNotice(''); }} className="font-bold text-leaf underline underline-offset-4">Back to sign in</button></p>}
          {!resetMode && <p className="mt-8 text-center text-ink-soft">
            Not a supplier yet? <Link href="/#farmers" className="font-bold text-leaf underline underline-offset-4">Apply to sell on Saplaya</Link>
          </p>}
        </div>
      </main>
    </div>
  );
}
