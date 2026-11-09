import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { withoutProtectedPrices, type StorefrontProduct } from '../src/lib/storefront';
import { orderMode, volumePrice, volumeTheme, volumeTier } from '../src/lib/volume';

const product: StorefrontProduct = {
  id: 'item', name: 'Beans', category: 'Grains', unit: 'kg',
  retail_price: 100, wholesale_price: 80, bulk_price: 70, mega_bulk_price: 60,
  wholesale_min_qty: 10, stock: 10000, image_url: null, harvested_at: '2026-11-09T00:00:00Z',
};

test('quantity determines the visible price and the automatic basket theme', () => {
  for (const [qty, tier, price] of [
    [1, 'retail', 100], [10, 'wholesale', 80], [100, 'bulk', 70], [1000, 'mega_bulk', 60],
  ] as const) {
    assert.equal(volumeTier(product, qty, 'retail'), tier);
    assert.equal(volumePrice(product, qty, 'retail'), price);
    assert.equal(orderMode([{ product, qty }], 'retail'), tier);
    assert.equal(volumeTheme(tier).label.toLowerCase().replace('-', '_'), tier);
  }
  assert.equal(volumePrice(product, 1, 'wholesale'), 80);
  assert.equal(orderMode([], 'wholesale'), 'wholesale');
  assert.equal(volumePrice({ ...product, bulk_price: null }, 100, 'retail'), null);
});

test('public products do not retain protected prices in browser cart data', () => {
  const publicProduct = withoutProtectedPrices(product);
  assert.equal(volumePrice(publicProduct, 99, 'retail'), 80);
  assert.equal(volumePrice(publicProduct, 100, 'retail'), null);
  assert.equal(volumePrice(publicProduct, 1000, 'retail'), null);
  assert.equal(publicProduct.bulk_price, null);
  assert.equal(publicProduct.mega_bulk_price, null);
});
