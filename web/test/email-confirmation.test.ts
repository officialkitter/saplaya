import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { parseEmailLink, verifyEmailLink } from '../src/lib/email-confirmation';

const origin = 'https://www.saplaya.org';

test('email link preserves only trusted callback destinations', () => {
  const link = new URL('/auth/confirm', origin);
  link.searchParams.set('token_hash', 'token');
  link.searchParams.set('type', 'invite');
  link.searchParams.set('redirect_to', `${origin}/auth/callback?returnTo=%2Flogin`);
  assert.deepEqual(parseEmailLink(link.href), { tokenHash: 'token', type: 'invite', team: true });
  link.searchParams.set('redirect_to', 'https://evil.example/auth/callback?returnTo=%2Flogin');
  assert.throws(() => parseEmailLink(link.href), /invalid destination/);
  link.searchParams.set('type', 'signup');
  assert.throws(() => parseEmailLink(link.href), /incomplete/);
  assert.throws(() => parseEmailLink(`${origin}/auth/confirm?token_hash=hash&type=invite`), /missing its destination/);
});

test('verification happens only when explicitly invoked and requires a session', async () => {
  let calls = 0;
  const client = { auth: { async verifyOtp() {
    calls++;
    return { data: { session: { access_token: 'a', refresh_token: 'b' } }, error: null };
  } } } as unknown as SupabaseClient;
  const link = parseEmailLink(`${origin}/auth/confirm?token_hash=hash&type=recovery`);
  assert.equal(calls, 0);
  assert.equal(await verifyEmailLink(client, link), '/auth/callback#access_token=a&refresh_token=b&type=recovery');
  assert.equal(calls, 1);
  const missingSession = { auth: { async verifyOtp() {
    return { data: { session: null }, error: null };
  } } } as unknown as SupabaseClient;
  await assert.rejects(verifyEmailLink(missingSession, link), /active session/);
});
