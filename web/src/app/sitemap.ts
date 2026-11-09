import type { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: 'https://www.saplaya.org/' },
    { url: 'https://www.saplaya.org/privacy' },
  ];
}
