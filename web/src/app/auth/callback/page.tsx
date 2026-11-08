'use client';

import { AlertCircle, CheckCircle2, LoaderCircle, LockKeyhole } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { LogoMark } from '@/components/ui/Logo';
import { getSupabase } from '@/lib/supabase';
import { processAuthCallback, type CallbackResult } from '@/lib/auth-callback';

type CallbackState =
  | { status: 'processing'; message: string }
  | { status: 'recovery'; message: string }
  | { status: 'error'; message: string };

const APP_CALLBACK = 'saplaya://auth/callback';
let pendingCallback: { href: string; result: Promise<CallbackResult> } | undefined;

function deepLinkWithSession(accessToken: string, refreshToken: string, type: string) {
  const fragment = new URLSearchParams({
    access_token: accessToken,
    refresh_token: refreshToken,
    type,
  });
  window.location.replace(`${APP_CALLBACK}#${fragment.toString()}`);
}

export default function AuthCallbackPage() {
  const [state, setState] = useState<CallbackState>({
    status: 'processing',
    message: 'Securely completing your Saplaya sign-in…',
  });
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [adminReset, setAdminReset] = useState(false);
  const [isInvite, setIsInvite] = useState(false);

  useEffect(() => {
    let active = true;
    const processCallback = async () => {
      const isAdminReset = new URLSearchParams(window.location.search).get('returnTo') === '/login';
      if (active) setAdminReset(isAdminReset);
      const href = window.location.href;
      if (!pendingCallback || pendingCallback.href !== href) {
        pendingCallback = { href, result: processAuthCallback(getSupabase(), href) };
      }
      const result = await pendingCallback.result;
      if (!active) return;
      if (result.kind === 'oauth') {
        window.location.replace('/login');
        return;
      }
      if (result.kind === 'password') {
        window.history.replaceState(null, '', result.team ? '/auth/callback?returnTo=%2Flogin' : '/auth/callback');
        setAdminReset(result.team);
        setIsInvite(result.invite);
        setState({ status: 'recovery', message: result.invite
          ? 'Choose a password to finish setting up your team account.'
          : 'Choose a new password for your Saplaya account.' });
        return;
      }
      window.history.replaceState(null, '', '/auth/callback');
      deepLinkWithSession(result.session.access_token, result.session.refresh_token, result.type);
    };

    void processCallback().catch((error: unknown) => {
      console.error('Saplaya auth callback failed:', error);
      if (active) {
        const teamReturn = new URLSearchParams(window.location.search).get('returnTo') === '/login';
        window.history.replaceState(null, '', teamReturn ? '/auth/callback?returnTo=%2Flogin' : '/auth/callback');
        setState({
          status: 'error',
          message: error instanceof Error ? error.message : 'We could not verify this link. Request a new one and try again.',
        });
      }
    });

    return () => {
      active = false;
    };
  }, []);

  async function saveNewPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password.length < 8) {
      setState({ status: 'recovery', message: 'Use a password with at least 8 characters.' });
      return;
    }
    if (password !== confirmPassword) {
      setState({ status: 'recovery', message: 'The passwords do not match. Check both fields and try again.' });
      return;
    }

    setSaving(true);
    try {
      const supabase = getSupabase();
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      if (!data.session) throw new Error('Your link has expired. Request a new invitation or password reset link.');

      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;

      const { data: updated, error: updatedSessionError } = await supabase.auth.getSession();
      if (updatedSessionError) throw updatedSessionError;
      if (!updated.session) throw new Error('Your password was updated, but we could not finish signing you in.');
      if (adminReset) {
        const { error: signOutError } = await supabase.auth.signOut({ scope: 'local' });
        if (signOutError) throw new Error('Your password was saved, but the temporary session could not be cleared. Please sign out before signing in again.');
        window.location.replace('/login?passwordReset=success');
        return;
      }
      deepLinkWithSession(updated.session.access_token, updated.session.refresh_token, 'recovery');
    } catch (error) {
      console.error('Saplaya password recovery failed:', error);
      setState({
        status: 'recovery',
        message: error instanceof Error ? error.message : 'We could not save your password. Try again.',
      });
      setSaving(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-milk px-5 py-10">
      <section className="w-full max-w-md rounded-[2rem] border border-line bg-white p-7 shadow-lift sm:p-9">
        <div className="mb-7 flex items-center gap-3">
          <LogoMark size={48} />
          <span className="font-display text-2xl font-extrabold text-ink">Saplaya</span>
        </div>

        {state.status === 'processing' && (
          <div className="py-8 text-center" role="status">
            <LoaderCircle className="mx-auto animate-spin text-leaf" size={40} />
            <h1 className="mt-5 font-display text-2xl font-extrabold">Finishing sign-in</h1>
            <p className="mt-2 text-ink-soft">{state.message}</p>
          </div>
        )}

        {state.status === 'recovery' && (
          <>
            <div className="mb-6 grid h-12 w-12 place-items-center rounded-2xl bg-leaf-soft text-leaf">
              <LockKeyhole size={24} />
            </div>
            <h1 className="font-display text-3xl font-extrabold">{isInvite ? 'Set your password' : 'Choose a new password'}</h1>
            <p className="mt-2 text-ink-soft">{state.message}</p>
            <form className="mt-7 space-y-4" onSubmit={(event) => void saveNewPassword(event)}>
              <label className="block text-sm font-bold text-ink" htmlFor="new-password">New password</label>
              <input
                id="new-password"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full rounded-2xl border border-line bg-white px-4 py-3 outline-none focus:border-leaf focus:ring-2 focus:ring-leaf/20"
              />
              <label className="block text-sm font-bold text-ink" htmlFor="confirm-password">Confirm new password</label>
              <input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                className="w-full rounded-2xl border border-line bg-white px-4 py-3 outline-none focus:border-leaf focus:ring-2 focus:ring-leaf/20"
              />
              <button
                type="submit"
                disabled={saving}
                className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-leaf px-5 py-3 font-extrabold text-white transition hover:bg-leaf-deep disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? <LoaderCircle className="animate-spin" size={19} /> : <CheckCircle2 size={19} />}
                {saving ? 'Saving password…' : 'Save new password'}
              </button>
            </form>
          </>
        )}

        {state.status === 'error' && (
          <div className="py-5" role="alert">
            <AlertCircle className="text-[#B71C1C]" size={38} />
            <h1 className="mt-4 font-display text-2xl font-extrabold">This link could not be used</h1>
            <p className="mt-2 text-ink-soft">{state.message}</p>
            <a href={adminReset ? '/login' : 'saplaya://'} className="mt-6 inline-flex min-h-11 items-center rounded-2xl bg-leaf px-5 py-3 font-extrabold text-white">
              {adminReset ? 'Return to sign in' : 'Open Saplaya'}
            </a>
          </div>
        )}
      </section>
    </main>
  );
}
