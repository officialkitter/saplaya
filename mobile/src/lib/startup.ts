import { Image } from 'expo-image';
import { fetchProducts, fetchPromos } from './api';
import { Product, Promo } from '../types';

type StartupData = {
  products: { items: Product[]; hasMore: boolean };
  promos: Promo[];
};

let startupData: StartupData | null = null;
let preloadRequest: Promise<void> | null = null;

export function getStartupData(): StartupData | null {
  return startupData;
}

export function preloadStartupData(): Promise<void> {
  if (!preloadRequest) {
    preloadRequest = Promise.all([fetchProducts(0), fetchPromos()])
      .then(async ([products, promos]) => {
        startupData = { products, promos };
        const imageUrls = [
          ...products.items.slice(0, 6).map((product) => product.image_url),
          ...promos.slice(0, 3).map((promo) => promo.image_url),
        ].filter((url): url is string => !!url);
        const imageResults = await Promise.all(imageUrls.map(async (url) => {
          try {
            return await Image.prefetch(url);
          } catch (error) {
            console.error(`Could not preload startup image ${url}:`, error);
            return false;
          }
        }));
        const failures = imageResults.filter((loaded) => !loaded).length;
        if (failures) console.warn(`Could not preload ${failures} startup image(s).`);
      })
      .catch((error: unknown) => {
        console.error('Could not preload storefront data:', error);
      });
  }
  return preloadRequest;
}
