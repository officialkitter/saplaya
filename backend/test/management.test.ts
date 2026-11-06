import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { calculateWeeklyCommission, supplierMatchesScopes, weekBoundsUtc } from '../src/management.js';

test('weekly incentive uses delivered sales, margin pool, configured tier, and budget cap', () => {
  const policy = { margin_pool_pct: 10, incentive_budget_pct: 1, bonus_rate_pct: 0.1 };
  const tiers = [
    { target_sales_tzs: 100_000, commission_rate_pct: 0.2 },
    { target_sales_tzs: 500_000, commission_rate_pct: 0.5 },
  ];

  assert.deepEqual(calculateWeeklyCommission(99_999, policy, tiers), {
    sales_value_tzs: 99_999,
    margin_pool_tzs: 10_000,
    target_sales_tzs: null,
    commission_rate_pct: 0,
    commission_tzs: 0,
    bonus_tzs: 0,
    total_tzs: 0,
  });
  assert.deepEqual(calculateWeeklyCommission(1_000_000, policy, tiers), {
    sales_value_tzs: 1_000_000,
    margin_pool_tzs: 100_000,
    target_sales_tzs: 500_000,
    commission_rate_pct: 0.5,
    commission_tzs: 500,
    bonus_tzs: 100,
    total_tzs: 600,
  });
});

test('weekly incentive cannot exceed the configured budget even with invalid legacy tiers', () => {
  const result = calculateWeeklyCommission(
    1_000_000,
    { margin_pool_pct: 10, incentive_budget_pct: 0.25, bonus_rate_pct: 0.1 },
    [{ target_sales_tzs: 1, commission_rate_pct: 0.5 }],
  );
  assert.equal(result.total_tzs, 250);
});

test('operation scopes match a country and region, with optional district narrowing', () => {
  const supplier = { country_code: 'TZ', region_code: 'TZ-03', district_code: 'DOD' };
  assert.equal(supplierMatchesScopes(supplier, [{ country_code: 'TZ', region_code: 'TZ-03', district_code: null }]), true);
  assert.equal(supplierMatchesScopes(supplier, [{ country_code: 'TZ', region_code: 'TZ-03', district_code: 'DOD' }]), true);
  assert.equal(supplierMatchesScopes(supplier, [{ country_code: 'TZ', region_code: 'TZ-03', district_code: 'DSM' }]), false);
  assert.equal(supplierMatchesScopes(supplier, [{ country_code: 'KE', region_code: 'TZ-03', district_code: null }]), false);
});

test('weekly periods begin Monday at midnight UTC', () => {
  const { start, end } = weekBoundsUtc(new Date('2026-11-08T19:30:00Z'));
  assert.equal(start.toISOString(), '2026-11-02T00:00:00.000Z');
  assert.equal(end.toISOString(), '2026-11-09T00:00:00.000Z');
});
