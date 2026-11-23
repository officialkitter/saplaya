import assert from 'node:assert/strict';
import { test } from 'node:test';
import { claimMatchesFilters, ordersMatchingProducts } from '../src/lib/claims';

const orders = [
  { id: '1', code: 'ABC123', supplier_name: 'Green Farm', items: [{ name: 'Tomatoes' }, { name: 'Kale' }] },
  { id: '2', code: 'DEF456', supplier_name: 'Red Valley', items: [{ name: 'Kale' }] },
];

test('claims can filter by order, farm and product text', () => {
  assert.equal(claimMatchesFilters(orders[0], 'tomato', new Set()), true);
  assert.equal(claimMatchesFilters(orders[0], 'green', new Set()), true);
  assert.equal(claimMatchesFilters(orders[1], 'red valley', new Set()), true);
  assert.equal(claimMatchesFilters(orders[1], 'tomato', new Set()), false);
});

test('matching product claims require every selected product', () => {
  assert.deepEqual(
    ordersMatchingProducts(orders, new Set(['Kale'])).map((order) => order.id),
    ['1', '2'],
  );
  assert.deepEqual(
    ordersMatchingProducts(orders, new Set(['Tomatoes', 'Kale'])).map((order) => order.id),
    ['1'],
  );
  assert.deepEqual(ordersMatchingProducts(orders, new Set()), []);
});
