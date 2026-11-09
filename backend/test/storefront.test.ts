import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  calculateTierPrices,
  deriveOrderMode,
  priceForQuantity,
  publicTierPrices,
  searchStorefrontProducts,
  selectStorefrontProducts,
} from '../src/storefront.js';

test('public catalog never discloses bulk tier amounts', () => {
  assert.deepEqual(publicTierPrices(), { bulk_price: null, mega_bulk_price: null });
});

test('checkout prices only apply each volume tier at its threshold', () => {
  const product = { retail_price: 100, wholesale_price: 80, bulk_price: 70, mega_bulk_price: 60, wholesale_min_qty: 10 };
  assert.equal(priceForQuantity(product, 9, 'retail'), 100);
  assert.equal(priceForQuantity(product, 10, 'retail'), 80);
  assert.equal(priceForQuantity(product, 99, 'retail'), 80);
  assert.equal(priceForQuantity(product, 100, 'retail'), 70);
  assert.equal(priceForQuantity(product, 999, 'retail'), 70);
  assert.equal(priceForQuantity(product, 1000, 'retail'), 60);
  assert.equal(priceForQuantity({ ...product, bulk_price: null }, 100, 'retail'), null);
});

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

test('catalog search filters all listings before pagination and sorts by retail price or distance', () => {
  const now = Date.parse('2026-01-03T12:00:00Z');
  const listings = [
    { product: { name: 'Beans', category: 'Grains', retail_price: 2000, harvested_at: '2026-01-03T10:00:00Z' }, distance: 5 },
    { product: { name: 'Red beans', category: 'Grains', retail_price: 1000, harvested_at: '2026-01-01T10:00:00Z' }, distance: null },
    { product: { name: 'Carrots', category: 'Vegetables', retail_price: 1500, harvested_at: '2026-01-03T11:00:00Z' }, distance: 1 },
  ];
  assert.deepEqual(searchStorefrontProducts(listings, { query: 'BEANS', category: 'grains', sort: 'price_asc' }, now)
    .map(({ product }) => product.name), ['Red beans', 'Beans']);
  assert.deepEqual(searchStorefrontProducts(listings, { minPrice: 1200, maxPrice: 2000, fresh: true, sort: 'nearby' }, now)
    .map(({ product }) => product.name), ['Carrots', 'Beans']);
  assert.deepEqual(searchStorefrontProducts(listings, { query: 'vegetables' }, now)
    .map(({ product }) => product.name), ['Carrots']);
  assert.deepEqual(searchStorefrontProducts(listings, { sort: 'price_desc' }, now)
    .map(({ product }) => product.name), ['Beans', 'Carrots', 'Red beans']);
});

test('catalog price sorting places missing and malformed prices last in both directions', () => {
  const listings = [
    { product: { name: 'Missing', retail_price: null }, distance: null },
    { product: { name: 'Invalid', retail_price: 'bad' }, distance: null },
    { product: { name: 'High', retail_price: 50 }, distance: null },
    { product: { name: 'Low', retail_price: 10 }, distance: null },
  ];
  assert.deepEqual(searchStorefrontProducts(listings, { sort: 'price_asc' }).map(({ product }) => product.name), ['Low', 'High', 'Invalid', 'Missing']);
  assert.deepEqual(searchStorefrontProducts(listings, { sort: 'price_desc' }).map(({ product }) => product.name), ['High', 'Low', 'Invalid', 'Missing']);
  assert.deepEqual(searchStorefrontProducts(listings, { minPrice: 0 }).map(({ product }) => product.name), ['High', 'Low']);
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
