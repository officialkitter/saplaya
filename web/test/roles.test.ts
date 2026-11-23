import assert from 'node:assert/strict';
import { test } from 'node:test';
import { can } from '../src/lib/roles';

test('platform managers can manage farm products and invite team members', () => {
  assert.equal(can('platform_manager', 'products.edit'), true);
  assert.equal(can('platform_manager', 'team.manage'), true);
  assert.equal(can('platform_manager', 'settings.manage'), false);
});

test('platform owners can edit and remove farm listings', () => {
  assert.equal(can('platform_owner', 'products.edit'), true);
  assert.equal(can('platform_owner', 'suppliers.manage'), true);
});

test('farm staff can add and manage listings without team administration access', () => {
  assert.equal(can('supplier_staff', 'products.edit'), true);
  assert.equal(can('supplier_staff', 'team.manage'), false);
});

test('server-returned role permissions are authoritative', () => {
  assert.equal(can('platform_manager', 'products.edit', ['dashboard.view']), false);
  assert.equal(can('platform_manager', 'team.manage', ['team.manage']), true);
  assert.equal(can('supervisor', 'products.edit', ['products.view', 'products.edit']), true);
  assert.equal(can('supervisor', 'products.edit', ['products.view']), false);
});
