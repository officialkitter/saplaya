import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { activateTeamInvitation, claimPendingTeamInvitation, teamInvitationRedirect } from '../src/team-auth.js';

test('team invite redirects require an explicitly configured safe origin', () => {
  assert.equal(teamInvitationRedirect('https://admin.example.test'), 'https://admin.example.test/auth/callback?returnTo=%2Flogin');
  assert.equal(teamInvitationRedirect('http://localhost:3001'), 'http://localhost:3001/auth/callback?returnTo=%2Flogin');
  for (const origin of [undefined, '', '*', 'https://*.example.test', 'http://admin.example.test',
    'https://example.test/path', 'https://example.test/?x=1', 'https://user@example.test',
    'https://example.test,https://evil.test', ' https://example.test']) {
    assert.equal(teamInvitationRedirect(origin), null, String(origin));
  }
});

type Row = { id: string; user_id: string | null; email: string; status: string };

function fakeDb(rows: Row[]): SupabaseClient {
  return {
    from(table: string) {
      assert.equal(table, 'team_members');
      let filters: ((row: Row) => boolean)[] = [];
      let changes: Partial<Row> | undefined;
      const query = {
        select() { return query; },
        update(values: Partial<Row>) { changes = values; return query; },
        eq(key: keyof Row, value: string) {
          filters.push((row) => row[key] === value);
          return query;
        },
        is(key: keyof Row, value: null) {
          filters.push((row) => row[key] === value);
          return query;
        },
        ilike(key: keyof Row, pattern: string) {
          // SQL LIKE patterns escape these characters with backslash.
          const value = pattern.replace(/\\([\\%_])/g, '$1');
          filters.push((row) => String(row[key]).toLowerCase() === value.toLowerCase());
          return query;
        },
        async limit(limit: number) {
          return { data: rows.filter((row) => filters.every((filter) => filter(row))).slice(0, limit).map((row) => ({ ...row })), error: null };
        },
        async maybeSingle() {
          const matches = rows.filter((row) => filters.every((filter) => filter(row)));
          if (matches.length > 1) return { data: null, error: new Error('multiple rows') };
          if (matches[0] && changes) Object.assign(matches[0], changes);
          return { data: matches[0] ? { ...matches[0] } : null, error: null };
        },
      };
      return query;
    },
  } as unknown as SupabaseClient;
}

function user(overrides: Partial<User> = {}): User {
  return { id: 'auth-1', email: 'owner@example.test', email_confirmed_at: '2026-01-01', is_anonymous: false, ...overrides } as User;
}

test('verified owner and farm-owner invitations are linked and activated, including concurrent requests', async () => {
  for (const role of ['platform_owner', 'supplier_owner']) {
    const row = { id: role, user_id: null, email: 'Owner@example.test', status: 'invited' };
    const db = fakeDb([row]);
    const claimed = await Promise.all([claimPendingTeamInvitation(db, user()), claimPendingTeamInvitation(db, user())]);
    assert.deepEqual(claimed.map((member) => member?.id), [role, role]);
    assert.equal(row.user_id, 'auth-1');
    assert.equal((await claimPendingTeamInvitation(db, user()))?.id, role);
    assert.deepEqual(await Promise.all([
      activateTeamInvitation(db, role, 'auth-1'),
      activateTeamInvitation(db, role, 'auth-1'),
    ]), [true, true]);
    assert.equal(row.status, 'active');
  }
});

test('unverified, anonymous, suspended, already linked, and ambiguous invitations are never claimed', async () => {
  const pending = () => ({ id: 'one', user_id: null, email: 'owner@example.test', status: 'invited' });
  for (const account of [user({ email_confirmed_at: undefined }), user({ is_anonymous: true })]) {
    const row = pending();
    assert.equal(await claimPendingTeamInvitation(fakeDb([row]), account), null);
    assert.equal(row.user_id, null);
  }
  for (const row of [
    { ...pending(), status: 'suspended' },
    { ...pending(), status: 'active' },
    { ...pending(), user_id: 'other-user' },
  ]) {
    assert.equal(await claimPendingTeamInvitation(fakeDb([row]), user()), null);
  }
  const duplicate = [pending(), { ...pending(), id: 'two', email: 'Owner@example.test', status: 'suspended' }];
  assert.equal(await claimPendingTeamInvitation(fakeDb(duplicate), user()), null);
  assert.equal(duplicate[0].user_id, null);
});

test('SQL wildcard characters in verified email are escaped', async () => {
  let pattern = '';
  const db = {
    from() {
      const query = {
        select() { return query; },
        ilike(_key: string, value: string) { pattern = value; return query; },
        async limit() { return { data: [], error: null }; },
      };
      return query;
    },
  } as unknown as SupabaseClient;
  await claimPendingTeamInvitation(db, user({ email: 'first_last%tag@example.test' }));
  assert.equal(pattern, 'first\\_last\\%tag@example.test');
});

test('activation never reactivates a suspended account or another user', async () => {
  const row = { id: 'member', user_id: 'auth-1', email: 'owner@example.test', status: 'suspended' };
  assert.equal(await activateTeamInvitation(fakeDb([row]), row.id, 'auth-1'), false);
  row.status = 'invited';
  assert.equal(await activateTeamInvitation(fakeDb([row]), row.id, 'other-user'), false);
  assert.equal(row.status, 'invited');
});
