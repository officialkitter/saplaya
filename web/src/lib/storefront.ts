'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  isStorefrontPageData,
  withoutProtectedPrices,
  type StorefrontFilters,
  type StorefrontPageData,
  type StorefrontProduct,
} from './storefront-contract';

export type { StorefrontFilters, StorefrontPageData, StorefrontProduct } from './storefront-contract';

export { isStorefrontProduct } from './storefront-contract';
export { withoutProtectedPrices } from './storefront-contract';

async function fetchStorefrontProducts(limit: number, page: number, filters: StorefrontFilters, location?: { lat: number; lng: number }): Promise<StorefrontPageData> {
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
  if (!isStorefrontPageData(result)) {
    throw new Error('The storefront API returned an unexpected product response.');
  }
  return { ...result, items: result.items.map(withoutProtectedPrices) };
}

export function useStorefrontProducts(
  limit: number,
  location?: { lat: number; lng: number } | null,
  filters: StorefrontFilters = {},
  initialData?: StorefrontPageData,
  initialError = false,
) {
  const [products, setProducts] = useState<StorefrontProduct[]>(initialData?.items ?? []);
  const [loading, setLoading] = useState(!initialData);
  const [error, setError] = useState(initialError && !initialData);
  const [requestVersion, setRequestVersion] = useState(0);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(initialData?.hasMore ?? false);
  const [categories, setCategories] = useState<string[]>(initialData?.categories ?? []);
  const generation = useRef(0);
  const skipInitialRequest = useRef(Boolean(initialData));

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
    if (skipInitialRequest.current && !location) {
      skipInitialRequest.current = false;
      return () => { active = false; generation.current += 1; };
    }
    skipInitialRequest.current = false;
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
