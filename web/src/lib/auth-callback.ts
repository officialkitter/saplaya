import type { SupabaseClient } from '@supabase/supabase-js';

type AuthSession = { access_token: string; refresh_token: string };
export type CallbackResult =
  | { kind: 'password'; team: boolean; invite: boolean }
  | { kind: 'oauth' }
  | { kind: 'mobile'; session: AuthSession; type: string };

const mobileTypes = new Set(['magiclink', 'signup', 'invite']);

export async function processAuthCallback(supabase: SupabaseClient, href: string): Promise<CallbackResult> {
  const url = new URL(href);
  const hash = new URLSearchParams(url.hash.slice(1));
  const team = url.searchParams.get('returnTo') === '/login';
  const error = hash.get('error_description') ?? url.searchParams.get('error_description')
    ?? hash.get('error_code') ?? url.searchParams.get('error_code');
  if (error) throw new Error(error);

  const type = hash.get('type') ?? url.searchParams.get('type');
  const code = url.searchParams.get('code');
  let session: AuthSession;
  let effectiveType = type;
  if (code) {
    const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    if (exchangeError) throw exchangeError;
    if (!data.session) throw new Error('The sign-in link did not return an active session.');
    // Supabase returns redirectType at runtime but omits it from AuthTokenResponse.
    const redirectType = 'redirectType' in data && typeof data.redirectType === 'string' ? data.redirectType : null;
    if (redirectType && type && redirectType !== type) {
      throw new Error('This sign-in link has an inconsistent type.');
    }
    effectiveType = redirectType ?? type;
    session = data.session;
  } else {
    const accessToken = hash.get('access_token');
    const refreshToken = hash.get('refresh_token');
    if (!type || !accessToken || !refreshToken) {
      throw new Error('This link is incomplete. Request a new sign-in link and try again.');
    }
    if (!mobileTypes.has(type) && type !== 'recovery') {
      throw new Error('This type of sign-in link is not supported.');
    }
    const { data, error: sessionError } = await supabase.auth.setSession({
      access_token: accessToken, refresh_token: refreshToken,
    });
    if (sessionError) throw sessionError;
    if (!data.session) throw new Error('The sign-in link did not return an active session.');
    session = data.session;
  }

  if (team) {
    if (code && !effectiveType && url.searchParams.get('flow') === 'oauth') return { kind: 'oauth' };
    if (effectiveType !== 'invite' && effectiveType !== 'recovery') {
      throw new Error('This link is not a team invitation or password recovery link.');
    }
    return { kind: 'password', team: true, invite: effectiveType === 'invite' };
  }
  if (effectiveType === 'recovery') return { kind: 'password', team: false, invite: false };
  const mobileType = effectiveType ?? 'magiclink';
  if (!mobileTypes.has(mobileType)) throw new Error('This type of sign-in link is not supported.');
  return { kind: 'mobile', session, type: mobileType };
}
