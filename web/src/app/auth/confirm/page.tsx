'use client';

import { useEffect, useRef, useState } from 'react';
import { LogoMark } from '@/components/ui/Logo';
import { getSupabase } from '@/lib/supabase';
import { parseEmailLink, verifyEmailLink } from '@/lib/email-confirmation';

export default function ConfirmEmailPage() {
  const link = useRef<ReturnType<typeof parseEmailLink> | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (link.current) return;
    try {
      link.current = parseEmailLink(window.location.href);
      setReady(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'This link is incomplete. Request a new email.');
    } finally {
      window.history.replaceState(null, '', '/auth/confirm');
    }
  }, []);

  async function confirm() {
    if (!link.current || busy) return;
    setBusy(true);
    setError('');
    try {
      const destination = await verifyEmailLink(getSupabase(), link.current);
      window.location.replace(destination);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The link could not be verified. Request a new email.');
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-milk px-5 py-10">
      <section className="w-full max-w-md rounded-[2rem] border border-line bg-white p-7 shadow-lift sm:p-9">
        <div className="mb-7 flex items-center gap-3"><LogoMark size={48} /><span className="font-display text-2xl font-extrabold">Saplaya</span></div>
        <h1 className="font-display text-3xl font-extrabold">Continue securely</h1>
        <p className="mt-3 text-ink-soft">Select continue to use your one-time email link. If you did not request it, close this page.</p>
        {error && <p role="alert" className="mt-4 rounded-xl bg-[#FFEBEE] p-3 text-[#B71C1C]">{error}</p>}
        <button type="button" onClick={() => void confirm()} disabled={!ready || busy} className="mt-6 min-h-12 w-full rounded-2xl bg-leaf px-5 py-3 font-extrabold text-white disabled:opacity-60">
          {busy ? 'Checking link…' : 'Continue'}
        </button>
        <a href="/login" className="mt-4 inline-block font-bold text-leaf underline">Return to member sign in</a>
      </section>
    </main>
  );
}
