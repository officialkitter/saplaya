import type { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: 'https://www.saplaya.org/', priority: 1.0 },
    { url: 'https://www.saplaya.org/how-it-works', priority: 0.8 },
    { url: 'https://www.saplaya.org/fresh-today', priority: 0.8 },
    { url: 'https://www.saplaya.org/for-farmers', priority: 0.8 },
    { url: 'https://www.saplaya.org/faq', priority: 0.8 },
    { url: 'https://www.saplaya.org/help', priority: 0.8 },
    { url: 'https://www.saplaya.org/privacy', priority: 0.4 },
  ];
}
