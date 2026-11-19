import type { Metadata } from 'next';

export const SITE_URL = 'https://www.saplaya.org';
export const BRAND_IMAGE = '/saplaya-icon.png';
export const MARKETPLACE_DESCRIPTION =
  'Saplaya is a fresh produce delivery and wholesale marketplace connecting customers with local farms.';

export function publicMetadata({
  title,
  description,
  pathname,
  image = BRAND_IMAGE,
  imageAlt = 'Saplaya fresh produce delivery and wholesale marketplace',
}: {
  title: string;
  description: string;
  pathname: string;
  image?: string;
  imageAlt?: string;
}): Metadata {
  const url = new URL(pathname, SITE_URL).toString();
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: 'website',
      url,
      siteName: 'Saplaya',
      title,
      description,
      images: [{ url: image, alt: imageAlt }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [{ url: image, alt: imageAlt }],
    },
  };
}

export function configuredSocialProfiles(): string[] {
  const candidates = [
    process.env.NEXT_PUBLIC_SAPLAYA_INSTAGRAM_URL,
    process.env.NEXT_PUBLIC_SAPLAYA_FACEBOOK_URL,
    process.env.NEXT_PUBLIC_SAPLAYA_LINKEDIN_URL,
    process.env.NEXT_PUBLIC_SAPLAYA_X_URL,
  ];

  return candidates.flatMap((candidate) => {
    if (!candidate) return [];
    try {
      const url = new URL(candidate);
      return url.protocol === 'https:' ? [url.toString()] : [];
    } catch {
      return [];
    }
  });
}
