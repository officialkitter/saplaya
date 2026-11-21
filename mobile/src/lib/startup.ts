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
      .then(([products, promos]) => {
        startupData = { products, promos };
      })
      .catch((error: unknown) => {
        console.error('Could not preload storefront data:', error);
      });
  }
  return preloadRequest;
}
