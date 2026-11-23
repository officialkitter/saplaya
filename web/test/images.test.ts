import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { generatedProductPhotoUrl, productPhotoUrl } from '../src/lib/images';

test('products without uploaded images get matching high-resolution photos', () => {
  const image = new URL(productPhotoUrl('Roma Tomatoes', 480));
  assert.match(image.pathname, /photo-1592924357228-91a4daadcfea/);
  assert.equal(image.searchParams.get('w'), '480');
});

test('unknown products get a general market photo rather than an empty image', () => {
  assert.match(productPhotoUrl('Unknown pantry item'), /photo-1542838132-92c53300491e/);
});

test('missing images have a guaranteed white-background generated fallback', () => {
  const generated = generatedProductPhotoUrl('Mango', 800);
  assert.match(generated, /^data:image\/svg\+xml/);
  assert.match(decodeURIComponent(generated), /fill="#ffffff"/);
  assert.match(decodeURIComponent(generated), /Mango/);
});
