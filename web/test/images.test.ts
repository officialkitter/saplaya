import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { productPhotoUrl } from '../src/lib/images';

test('products without uploaded images get matching high-resolution photos', () => {
  const image = new URL(productPhotoUrl('Roma Tomatoes', 480));
  assert.match(image.pathname, /photo-1592924357228-91a4daadcfea/);
  assert.equal(image.searchParams.get('w'), '480');
});

test('unknown products get a general market photo rather than an empty image', () => {
  assert.match(productPhotoUrl('Unknown pantry item'), /photo-1542838132-92c53300491e/);
});
