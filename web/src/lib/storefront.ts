'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

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
  hasMore: boolean;
  categories?: string[];
};

export type StorefrontFilters = {
  query?: string;
  category?: string;
  minPrice?: string;
  maxPrice?: string;
  fresh?: boolean;
  sort?: 'default' | 'price_asc' | 'price_desc' | 'nearby';
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

async function fetchStorefrontProducts(limit: number, page: number, filters: StorefrontFilters, location?: { lat: number; lng: number }): Promise<StorefrontResponse> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL?.replace(/\/+$/, '');
  if (!apiUrl) throw new Error('The storefront API is not configured.');

  const query = new URLSearchParams({ page: String(page), size: String(limit) });
  if (filters.query?.trim()) query.set('q', filters.query.trim());
  if (filters.category) query.set('category', filters.category);
  if (filters.minPrice) query.set('minPrice', filters.minPrice);
  if (filters.maxPrice) query.set('maxPrice', filters.maxPrice);
  if (filters.fresh) query.set('fresh', 'true');
  if (filters.sort && filters.sort !== 'default') query.set('sort', filters.sort);
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
    || typeof (result as StorefrontResponse).hasMore !== 'boolean'
    || ((result as StorefrontResponse).categories !== undefined
      && (!Array.isArray((result as StorefrontResponse).categories)
        || !(result as StorefrontResponse).categories?.every((category) => typeof category === 'string')))
  ) {
    throw new Error('The storefront API returned an unexpected product response.');
  }
  return result as StorefrontResponse;
}

export function useStorefrontProducts(limit: number, location?: { lat: number; lng: number } | null, filters: StorefrontFilters = {}) {
  const [products, setProducts] = useState<StorefrontProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [requestVersion, setRequestVersion] = useState(0);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [categories, setCategories] = useState<string[]>([]);
  const generation = useRef(0);

  const retry = useCallback(() => setRequestVersion((version) => version + 1), []);

  useEffect(() => {
    let active = true;
    generation.current += 1;
    if (filters.sort === 'nearby' && !location) {
      setProducts([]);
      setHasMore(false);
      setError(true);
      setLoading(false);
      return () => { active = false; generation.current += 1; };
    }
    setLoading(true);
    setError(false);
    setPage(0);
    void fetchStorefrontProducts(limit, 0, filters, location ?? undefined)
      .then((result) => {
        if (active) {
          setProducts(result.items);
          setHasMore(result.hasMore);
          setCategories(result.categories ?? []);
        }
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
      generation.current += 1;
    };
  }, [limit, location?.lat, location?.lng, requestVersion, filters.query, filters.category, filters.minPrice, filters.maxPrice, filters.fresh, filters.sort]);

  const loadMore = useCallback(async () => {
    if (loading || !hasMore) return;
    const requestGeneration = generation.current;
    setLoading(true);
    try {
      const result = await fetchStorefrontProducts(limit, page + 1, filters, location ?? undefined);
      if (requestGeneration !== generation.current) return;
      setProducts((current) => [...current, ...result.items]);
      setPage((current) => current + 1);
      setHasMore(result.hasMore);
    } catch (cause) {
      console.error('Could not load more storefront products:', cause);
      if (requestGeneration === generation.current) setError(true);
    } finally {
      if (requestGeneration === generation.current) setLoading(false);
    }
  }, [loading, hasMore, limit, page, location?.lat, location?.lng, filters.query, filters.category, filters.minPrice, filters.maxPrice, filters.fresh, filters.sort]);

  return { products, loading, error, retry, hasMore, categories, loadMore };
}
