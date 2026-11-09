import type { SupabaseClient } from '@supabase/supabase-js';

type EmailLink = { tokenHash: string; type: 'invite' | 'recovery'; team: boolean };

const productionCallbackOrigins = new Set([
  'https://www.saplaya.org',
  'https://saplaya-web.up.railway.app',
]);

export function parseEmailLink(href: string): EmailLink {
  const url = new URL(href);
  const tokenHash = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type');
  if (!tokenHash || tokenHash.length > 512 || (type !== 'invite' && type !== 'recovery')) {
    throw new Error('This link is incomplete. Request a new email and try again.');
  }
  const redirect = url.searchParams.get('redirect_to');
  if (type === 'invite' && !redirect) {
    throw new Error('This invitation is missing its destination. Request a new email.');
  }
  let team = false;
  if (redirect) {
    let target: URL;
    try {
      target = new URL(redirect);
    } catch {
      throw new Error('This link has an invalid destination. Request a new email.');
    }
    const trustedOrigin = target.origin === url.origin
      || (productionCallbackOrigins.has(url.origin) && productionCallbackOrigins.has(target.origin));
    if (!trustedOrigin || target.username || target.password || target.pathname !== '/auth/callback'
      || target.hash || [...target.searchParams.keys()].some((key) => key !== 'returnTo')
      || (target.searchParams.has('returnTo') && target.searchParams.get('returnTo') !== '/login')) {
      throw new Error('This link has an invalid destination. Request a new email.');
    }
    team = target.searchParams.get('returnTo') === '/login';
  }
  if (type === 'invite' && !team) {
    throw new Error('This invitation has an invalid destination. Request a new email.');
  }
  return { tokenHash, type, team };
}

export async function verifyEmailLink(supabase: SupabaseClient, link: EmailLink): Promise<string> {
  const { data, error } = await supabase.auth.verifyOtp({ token_hash: link.tokenHash, type: link.type });
  if (error) throw error;
  if (!data.session) throw new Error('This link did not return an active session. Request a new email.');
  const fragment = new URLSearchParams({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    type: link.type,
  });
  return `/auth/callback${link.team ? '?returnTo=%2Flogin' : ''}#${fragment}`;
}
