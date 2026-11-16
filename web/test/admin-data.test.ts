import assert from 'node:assert/strict';
import { test } from 'node:test';
import { includeCurrentMember } from '../src/lib/admin-data';
import type { TeamMember } from '../src/lib/types';

const current: TeamMember = {
  id: 'me', supplierId: null, name: 'Owner', email: 'owner@example.test',
  role: 'platform_owner', status: 'active', avatarPath: 'me/photo.png',
  avatarUrl: 'https://example.test/photo.png', phone: '123',
};

test('team directory keeps the signed-in member’s complete profile', () => {
  const directory: TeamMember[] = [
    { ...current, avatarPath: undefined, avatarUrl: null, phone: null },
    { ...current, id: 'other', name: 'Other' },
  ];
  const result = includeCurrentMember(directory, current);
  assert.equal(result[0].avatarPath, 'me/photo.png');
  assert.equal(result[0].avatarUrl, 'https://example.test/photo.png');
  assert.equal(result[0].phone, '123');
  assert.equal(result[1].id, 'other');
});

test('the signed-in member remains available when omitted from the directory', () => {
  assert.deepEqual(includeCurrentMember([], current), [current]);
});
