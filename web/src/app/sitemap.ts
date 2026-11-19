import type { MetadataRoute } from 'next';
import { fetchStorefrontPage } from '@/lib/storefront-server';
import { SITE_URL } from '@/lib/seo';

export const revalidate = 3600;

const publicPageLastModified = new Date('2026-11-19T00:00:00.000Z');

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const products = new Map<string, { lastModified?: Date }>();
  const categories = new Map<string, Date | undefined>();
  let page = 0;
  let hasMore = true;

  while (hasMore) {
    const result = await fetchStorefrontPage(40, page, {}, 3600);
    if (result.hasMore && result.items.length === 0) {
      throw new Error('The public catalog returned an empty page before its last page.');
    }
    for (const product of result.items) {
      const lastModifiedTime = product.updated_at ? Date.parse(product.updated_at) : NaN;
      const lastModified = Number.isFinite(lastModifiedTime) ? new Date(lastModifiedTime) : undefined;
      products.set(product.id, { lastModified });
      if (product.category) {
        const categoryLastModified = categories.get(product.category);
        if (!categoryLastModified || (lastModified && lastModified > categoryLastModified)) {
          categories.set(product.category, lastModified);
        }
      }
    }
    hasMore = result.hasMore;
    page += 1;
    if (page > 1250 || (products.size >= 49_993 && hasMore)) {
      throw new Error('The public catalog exceeds the single-file sitemap limit.');
    }
  }

  const pages: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, lastModified: publicPageLastModified, priority: 1.0 },
    { url: `${SITE_URL}/how-it-works`, lastModified: publicPageLastModified, priority: 0.8 },
    { url: `${SITE_URL}/fresh-today`, lastModified: publicPageLastModified, priority: 0.8 },
    { url: `${SITE_URL}/for-farmers`, lastModified: publicPageLastModified, priority: 0.8 },
    { url: `${SITE_URL}/faq`, lastModified: publicPageLastModified, priority: 0.8 },
    { url: `${SITE_URL}/help`, lastModified: publicPageLastModified, priority: 0.8 },
    { url: `${SITE_URL}/privacy`, lastModified: publicPageLastModified, priority: 0.4 },
    ...[...categories.entries()].map(([category, lastModified]) => ({
      url: `${SITE_URL}/fresh-today?category=${encodeURIComponent(category)}`,
      ...(lastModified ? { lastModified } : {}),
      priority: 0.6,
    })),
    ...[...products.entries()].map(([id, product]) => ({
      url: `${SITE_URL}/products/${encodeURIComponent(id)}`,
      ...(product.lastModified ? { lastModified: product.lastModified } : {}),
      priority: 0.7,
    })),
  ];

  if (pages.length > 50_000) {
    throw new Error('The public catalog exceeds the single-file sitemap limit.');
  }
  return pages;
}
