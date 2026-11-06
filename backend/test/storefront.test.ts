import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  calculateTierPrices,
  deriveOrderMode,
  selectStorefrontProducts,
} from '../src/storefront.js';

const products = [
  { id: '1', name: 'Beans', stock: 5, supplier_id: 'missing-location', catalog_product_id: 'approved' },
  { id: '2', name: 'Carrots', stock: 5, supplier_id: 'located', catalog_product_id: 'approved' },
  { id: '3', name: 'Pending', stock: 5, supplier_id: 'missing-location', catalog_product_id: 'pending' },
  { id: '4', name: 'Inactive', stock: 5, supplier_id: 'inactive', catalog_product_id: 'approved' },
];
const suppliers = [
  { id: 'missing-location', status: 'active', latitude: null, longitude: null },
  { id: 'located', status: 'active', latitude: -6, longitude: 35 },
  { id: 'inactive', status: 'suspended', latitude: -6, longitude: 35 },
];

test('location prioritizes nearby farms without hiding stock at farms without coordinates', () => {
  const result = selectStorefrontProducts(products, suppliers, new Set(['approved']), { lat: -6, lng: 35 });
  assert.deepEqual(result.map((entry) => entry.product.id), ['2', '1']);
  assert.equal(result[0].distance, 0);
  assert.equal(result[1].distance, null);
});

test('approval and active farm checks apply with and without a customer location', () => {
  const result = selectStorefrontProducts(products, suppliers, new Set(['approved']), null);
  assert.deepEqual(result.map((entry) => entry.product.id), ['1', '2']);
  assert.ok(result.every((entry) => entry.distance === null));
});

test('a located farm is preferred over an unlocated farm for the same product', () => {
  const duplicate = { ...products[0], id: '5', supplier_id: 'located', stock: 1 };
  const result = selectStorefrontProducts([...products, duplicate], suppliers, new Set(['approved']), { lat: -6, lng: 35 });
  assert.equal(result.find((entry) => entry.product.name === 'Beans')?.product.id, '5');
});

test('owner percentages calculate rounded whole-TZS tiers from retail', () => {
  assert.deepEqual(calculateTierPrices(1000, { wholesale: 70, bulk: 65, mega_bulk: 55 }), {
    wholesale: 700,
    bulk: 650,
    mega_bulk: 550,
  });
  assert.deepEqual(calculateTierPrices(7, { wholesale: 70, bulk: 65, mega_bulk: 55 }), {
    wholesale: 5,
    bulk: 5,
    mega_bulk: 4,
  });
});

test('basket mode unlocks wholesale, bulk, and mega-bulk from one product quantity', () => {
  const product = { wholesale_min_qty: 10 };
  const line = (qty: number) => [{ qty, product }];
  assert.equal(deriveOrderMode(line(1), 'retail'), 'retail');
  assert.equal(deriveOrderMode(line(10), 'retail'), 'wholesale');
  assert.equal(deriveOrderMode(line(100), 'retail'), 'bulk');
  assert.equal(deriveOrderMode(line(1000), 'retail'), 'mega_bulk');
  assert.equal(deriveOrderMode([{ qty: 100, product }, { qty: 10, product }], 'retail'), 'bulk');
});
