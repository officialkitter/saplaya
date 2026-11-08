import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { processAuthCallback } from '../src/lib/auth-callback';

const session = { access_token: 'access', refresh_token: 'refresh' };
function client(redirectType: string | null = null) {
  let exchanges = 0;
  let sessions = 0;
  const supabase = { auth: {
    async exchangeCodeForSession() { exchanges++; return { data: { session, redirectType }, error: null }; },
    async setSession() { sessions++; return { data: { session }, error: null }; },
  } } as unknown as SupabaseClient;
  return { supabase, counts: () => ({ exchanges, sessions }) };
}
const callback = 'https://admin.example.test/auth/callback';

test('team invite and recovery fragments go to web password setup', async () => {
  for (const type of ['invite', 'recovery']) {
    const c = client();
    assert.deepEqual(await processAuthCallback(c.supabase, `${callback}?returnTo=%2Flogin#type=${type}&access_token=a&refresh_token=b`),
      { kind: 'password', team: true, invite: type === 'invite' });
    assert.deepEqual(c.counts(), { exchanges: 0, sessions: 1 });
  }
});

test('PKCE recovery uses the exchange redirect type and does not fall through to mobile', async () => {
  const c = client('recovery');
  assert.deepEqual(await processAuthCallback(c.supabase, `${callback}?returnTo=%2Flogin&code=abc`),
    { kind: 'password', team: true, invite: false });
  assert.deepEqual(c.counts(), { exchanges: 1, sessions: 0 });
  assert.deepEqual(await processAuthCallback(client('recovery').supabase, `${callback}?code=abc`),
    { kind: 'password', team: false, invite: false });
});

test('mobile signup, invitation, recovery and code callbacks keep their existing destinations', async () => {
  for (const type of ['signup', 'invite', 'magiclink']) {
    assert.deepEqual(await processAuthCallback(client().supabase, `${callback}#type=${type}&access_token=a&refresh_token=b`),
      { kind: 'mobile', session, type });
  }
  assert.deepEqual(await processAuthCallback(client().supabase, `${callback}#type=recovery&access_token=a&refresh_token=b`),
    { kind: 'password', team: false, invite: false });
  assert.deepEqual(await processAuthCallback(client().supabase, `${callback}?code=abc`),
    { kind: 'mobile', session, type: 'magiclink' });
});

test('invalid, expired, unknown and conflicting callback types fail closed', async () => {
  await assert.rejects(processAuthCallback(client().supabase, `${callback}?returnTo=%2Flogin&code=abc`), /not a team invitation/);
  await assert.rejects(processAuthCallback(client('recovery').supabase, `${callback}?type=invite&code=abc`), /inconsistent/);
  await assert.rejects(processAuthCallback(client().supabase, `${callback}#type=invite&access_token=a`), /incomplete/);
  await assert.rejects(processAuthCallback(client().supabase, `${callback}#error_code=expired`), /expired/);
  await assert.rejects(processAuthCallback(client().supabase, `${callback}#type=unknown&access_token=a&refresh_token=b`), /not supported/);
});

test('team Google sign-in returns to the portal and ignores unmarked PKCE codes', async () => {
  assert.deepEqual(await processAuthCallback(client().supabase, `${callback}?returnTo=%2Flogin&flow=oauth&code=abc`), { kind: 'oauth' });
  await assert.rejects(processAuthCallback(client().supabase, `${callback}?returnTo=%2Flogin&code=abc`));
  assert.deepEqual(await processAuthCallback(client().supabase, `${callback}?flow=oauth&code=abc`),
    { kind: 'mobile', session, type: 'magiclink' });
});
