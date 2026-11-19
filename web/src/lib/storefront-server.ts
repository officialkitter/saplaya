import {
  isStorefrontPageData,
  isStorefrontProduct,
  withoutProtectedPrices,
  type StorefrontFilters,
  type StorefrontPageData,
  type StorefrontProduct,
} from './storefront-contract';

function storefrontApiUrl(path: string): string {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL?.replace(/\/+$/, '');
  if (!apiUrl) throw new Error('The storefront API is not configured.');
  return `${apiUrl}${path}`;
}

export async function fetchStorefrontPage(
  limit = 40,
  page = 0,
  filters: StorefrontFilters = {},
  revalidate = 300,
): Promise<StorefrontPageData> {
  const query = new URLSearchParams({ page: String(page), size: String(limit) });
  if (filters.query?.trim()) query.set('q', filters.query.trim());
  if (filters.category) query.set('category', filters.category);
  if (filters.minPrice) query.set('minPrice', filters.minPrice);
  if (filters.maxPrice) query.set('maxPrice', filters.maxPrice);
  if (filters.fresh) query.set('fresh', 'true');
  if (filters.sort && filters.sort !== 'default') query.set('sort', filters.sort);

  const response = await fetch(`${storefrontApiUrl('/products')}?${query}`, {
    next: { revalidate },
  });
  if (!response.ok) throw new Error(`The storefront API returned ${response.status}.`);
  const result: unknown = await response.json();
  if (!isStorefrontPageData(result)) {
    throw new Error('The storefront API returned an unexpected product response.');
  }
  return {
    ...result,
    items: result.items.map(withoutProtectedPrices),
  };
}

export class StorefrontProductNotFoundError extends Error {
  constructor() {
    super('Product not found.');
    this.name = 'StorefrontProductNotFoundError';
  }
}

export async function fetchStorefrontProduct(id: string, revalidate = 300): Promise<StorefrontProduct> {
  const response = await fetch(`${storefrontApiUrl(`/products/${encodeURIComponent(id)}`)}`, {
    next: { revalidate },
  });
  if (response.status === 404) throw new StorefrontProductNotFoundError();
  if (!response.ok) throw new Error(`The storefront API returned ${response.status}.`);
  const result: unknown = await response.json();
  if (!isStorefrontProduct(result)) {
    throw new Error('The storefront API returned an unexpected product response.');
  }
  return withoutProtectedPrices(result);
}
