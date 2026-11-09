import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/admin/', '/auth/', '/checkout/', '/orders'] },
    sitemap: 'https://www.saplaya.org/sitemap.xml',
    host: 'https://www.saplaya.org',
  };
}
