import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Providers } from '@/components/Providers';
import { BRAND_IMAGE, MARKETPLACE_DESCRIPTION } from '@/lib/seo';

const googleSiteVerification = process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION;

export const metadata: Metadata = {
  metadataBase: new URL('https://www.saplaya.org'),
  title: 'Saplaya Organization',
  description: MARKETPLACE_DESCRIPTION,
  openGraph: {
    type: 'website',
    siteName: 'Saplaya Organization',
    title: 'Saplaya Organization',
    description: MARKETPLACE_DESCRIPTION,
    images: [{ url: BRAND_IMAGE, alt: 'Saplaya fresh produce delivery and wholesale marketplace' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Saplaya Organization',
    description: MARKETPLACE_DESCRIPTION,
    images: [BRAND_IMAGE],
  },
  ...(googleSiteVerification ? { verification: { google: googleSiteVerification } } : {}),
  icons: {
    icon: '/saplaya-icon.png',
    shortcut: '/saplaya-icon.png',
    apple: '/saplaya-icon.png',
  },
};

export const viewport: Viewport = {
  themeColor: '#2E7D32',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700;12..96,800&family=Figtree:wght@400;500;600;700;800&display=swap"
        />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
