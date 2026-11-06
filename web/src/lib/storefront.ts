'use client';

import { useCallback, useEffect, useState } from 'react';

export type StorefrontProduct = {
  id: string;
  name: string;
  category: string;
  unit: string;
  retail_price: number;
  wholesale_price: number;
  wholesale_min_qty: number;
  bulk_price: number | null;
  mega_bulk_price: number | null;
  stock: number;
  image_url: string | null;
  harvested_at: string;
  farm_distance_km?: number | null;
};

type StorefrontResponse = {
  items: StorefrontProduct[];
};

export function isStorefrontProduct(value: unknown): value is StorefrontProduct {
  if (typeof value !== 'object' || value === null) return false;
  const product = value as Record<string, unknown>;
  return typeof product.id === 'string'
    && typeof product.name === 'string'
    && typeof product.category === 'string'
    && typeof product.unit === 'string'
    && typeof product.retail_price === 'number'
    && Number.isFinite(product.retail_price)
    && typeof product.wholesale_price === 'number'
    && Number.isFinite(product.wholesale_price)
    && typeof product.wholesale_min_qty === 'number'
    && Number.isFinite(product.wholesale_min_qty)
    && (product.bulk_price === null || (typeof product.bulk_price === 'number' && Number.isFinite(product.bulk_price)))
    && (product.mega_bulk_price === null || (typeof product.mega_bulk_price === 'number' && Number.isFinite(product.mega_bulk_price)))
    && typeof product.stock === 'number'
    && Number.isFinite(product.stock)
    && (typeof product.image_url === 'string' || product.image_url === null)
    && typeof product.harvested_at === 'string';
}

async function fetchStorefrontProducts(limit: number, location?: { lat: number; lng: number }): Promise<StorefrontProduct[]> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL?.replace(/\/+$/, '');
  if (!apiUrl) throw new Error('The storefront API is not configured.');

  const query = new URLSearchParams({ page: '0', size: String(limit) });
  if (location) {
    query.set('lat', String(location.lat));
    query.set('lng', String(location.lng));
  }
  const response = await fetch(`${apiUrl}/products?${query}`, { cache: 'no-store' });
  if (!response.ok) throw new Error(`The storefront API returned ${response.status}.`);
  const result: unknown = await response.json();
  if (
    typeof result !== 'object'
    || result === null
    || !('items' in result)
    || !Array.isArray((result as StorefrontResponse).items)
    || !(result as StorefrontResponse).items.every(isStorefrontProduct)
  ) {
    throw new Error('The storefront API returned an unexpected product response.');
  }
  return (result as StorefrontResponse).items;
}

export function useStorefrontProducts(limit: number, location?: { lat: number; lng: number } | null) {
  const [products, setProducts] = useState<StorefrontProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [requestVersion, setRequestVersion] = useState(0);

  const retry = useCallback(() => setRequestVersion((version) => version + 1), []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(false);
    void fetchStorefrontProducts(limit, location ?? undefined)
      .then((items) => {
        if (active) setProducts(items);
      })
      .catch((cause: unknown) => {
        console.error('Could not load live storefront products:', cause);
        if (active) {
          setProducts([]);
          setError(true);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [limit, location?.lat, location?.lng, requestVersion]);

  return { products, loading, error, retry };
}
