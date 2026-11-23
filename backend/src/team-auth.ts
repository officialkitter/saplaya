import type { SupabaseClient, User } from '@supabase/supabase-js';

const memberColumns = 'id, user_id, supplier_id, full_name, email, role, status';

export function teamInvitationRedirect(origin: string | undefined): string | null {
  if (!origin || origin !== origin.trim()) return null;
  try {
    const url = new URL(origin);
    if ((origin !== url.origin && origin !== `${url.origin}/`)
      || url.username || url.password || url.pathname !== '/' || url.search || url.hash
      || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))
      || url.hostname.includes('*') || origin.includes(',')) return null;
    return `${url.origin}/auth/callback?returnTo=%2Flogin`;
  } catch {
    return null;
  }
}

/**
 * Claims only an unlinked pending invitation for the verified Supabase email.
 * Matching all rows first makes differently-cased duplicate addresses fail closed.
 */
export async function claimPendingTeamInvitation(db: SupabaseClient, user: User) {
  if (user.is_anonymous || !user.email_confirmed_at || !user.email) return null;
  const email = user.email.trim();
  if (!email) return null;
  const pattern = email.replace(/[\\%_]/g, '\\$&');
  const { data: candidates, error } = await db.from('team_members')
    .select(memberColumns)
    .ilike('email', pattern)
    .limit(100);
  if (error) throw new Error('Could not look up the team invitation.');
  const exactMatches = (candidates ?? []).filter((candidate) =>
    candidate.email.trim().toLowerCase() === email.toLowerCase()
  );
  if (!exactMatches.length) return null;

  for (const candidate of exactMatches) {
    if (candidate.user_id === user.id) continue;
    if (candidate.user_id !== null || candidate.status !== 'invited') continue;
    await db.from('team_members')
      .update({ user_id: user.id })
      .eq('id', candidate.id)
      .is('user_id', null)
      .eq('status', 'invited');
  }

  const { data: existing, error: lookupError } = await db.from('team_members')
    .select(memberColumns)
    .eq('user_id', user.id)
    .in('status', ['invited', 'active'])
    .limit(100);
  if (lookupError) throw new Error('Could not look up the linked team invitation.');
  return existing?.[0] ?? null;
}

export async function activateTeamInvitation(db: SupabaseClient, memberId: string, userId: string) {
  const { data, error } = await db.from('team_members')
    .update({ status: 'active' })
    .eq('id', memberId)
    .eq('user_id', userId)
    .eq('status', 'invited')
    .select('id')
    .maybeSingle();
  if (error) return false;
  if (data) return true;

  const { data: current, error: lookupError } = await db.from('team_members')
    .select('id')
    .eq('id', memberId)
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle();
  return !lookupError && !!current;
}
