'use client';

import { AlertCircle, CheckCircle2, LoaderCircle, LockKeyhole } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { LogoMark } from '@/components/ui/Logo';
import { getSupabase } from '@/lib/supabase';

type CallbackState =
  | { status: 'processing'; message: string }
  | { status: 'recovery'; message: string }
  | { status: 'error'; message: string };

const APP_CALLBACK = 'saplaya://auth/callback';
const APP_AUTH_TYPES = new Set(['magiclink', 'signup', 'invite']);

function readAuthParams() {
  const hash = new URLSearchParams(window.location.hash.slice(1));
  const query = new URLSearchParams(window.location.search);
  return {
    hash,
    type: hash.get('type') ?? query.get('type'),
    accessToken: hash.get('access_token'),
    refreshToken: hash.get('refresh_token'),
    code: query.get('code'),
    errorDescription: hash.get('error_description') ?? query.get('error_description'),
    errorCode: hash.get('error_code') ?? query.get('error_code'),
  };
}

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

  useEffect(() => {
    let active = true;
    const processCallback = async () => {
      const isAdminReset = new URLSearchParams(window.location.search).get('returnTo') === '/login';
      if (active) setAdminReset(isAdminReset);
      const { hash, type, accessToken, refreshToken, code, errorDescription, errorCode } = readAuthParams();
      if (errorDescription || errorCode) {
        throw new Error(errorDescription ?? 'This sign-in link has expired or is no longer valid.');
      }

      const supabase = getSupabase();
      if (code) {
        const { data, error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) throw error;
        if (!data.session) throw new Error('The sign-in link did not return an active session.');
        if (active) {
          if (type === 'recovery') {
            setState({ status: 'recovery', message: 'Choose a new password for your Saplaya account.' });
          } else {
            deepLinkWithSession(data.session.access_token, data.session.refresh_token, type ?? 'magiclink');
          }
        }
        return;
      }

      if (!type || !accessToken || !refreshToken) {
        throw new Error('This link is incomplete. Request a new sign-in link and try again.');
      }

      if (!APP_AUTH_TYPES.has(type) && type !== 'recovery') {
        throw new Error('This type of sign-in link is not supported.');
      }

      const { data, error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      if (error) throw error;
      if (!data.session) throw new Error('The sign-in link did not return an active session.');

      if (!active) return;
      if (type === 'recovery') {
        setState({ status: 'recovery', message: 'Choose a new password for your Saplaya account.' });
        return;
      }
      deepLinkWithSession(data.session.access_token, data.session.refresh_token, type);
    };

    void processCallback().catch((error: unknown) => {
      console.error('Saplaya auth callback failed:', error);
      if (active) {
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
      if (!data.session) throw new Error('Your recovery link has expired. Request a new password reset link.');

      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;

      const { data: updated, error: updatedSessionError } = await supabase.auth.getSession();
      if (updatedSessionError) throw updatedSessionError;
      if (!updated.session) throw new Error('Your password was updated, but we could not finish signing you in.');
      if (new URLSearchParams(window.location.search).get('returnTo') === '/login') {
        const { error: signOutError } = await supabase.auth.signOut({ scope: 'local' });
        if (signOutError) console.error('Could not clear the password recovery session:', signOutError);
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
            <h1 className="font-display text-3xl font-extrabold">Choose a new password</h1>
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
