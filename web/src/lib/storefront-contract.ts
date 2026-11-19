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
  updated_at?: string;
  farm_distance_km?: number | null;
};

export type StorefrontPageData = {
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
    && typeof product.harvested_at === 'string'
    && (product.updated_at === undefined || typeof product.updated_at === 'string')
    && (product.farm_distance_km === undefined || product.farm_distance_km === null
      || (typeof product.farm_distance_km === 'number' && Number.isFinite(product.farm_distance_km)));
}

export function isStorefrontPageData(value: unknown): value is StorefrontPageData {
  if (typeof value !== 'object' || value === null) return false;
  const response = value as Record<string, unknown>;
  return Array.isArray(response.items)
    && response.items.every(isStorefrontProduct)
    && typeof response.hasMore === 'boolean'
    && (response.categories === undefined || (
      Array.isArray(response.categories)
      && response.categories.every((category) => typeof category === 'string')
    ));
}

export function withoutProtectedPrices(product: StorefrontProduct): StorefrontProduct {
  return { ...product, bulk_price: null, mega_bulk_price: null };
}
