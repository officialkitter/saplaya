import dynamic from 'next/dynamic';
import type { Metadata } from 'next';
import { Nav } from '@/components/landing/Nav';
import { Hero } from '@/components/landing/Hero';
import { serializeJsonLd } from '@/lib/json-ld';
import { MARKETPLACE_DESCRIPTION, publicMetadata, SITE_URL } from '@/lib/seo';
import { fetchStorefrontPage } from '@/lib/storefront-server';
import type { StorefrontPageData } from '@/lib/storefront-contract';

const title = 'Saplaya Organization Limited | Tanzania Produce';
const description = MARKETPLACE_DESCRIPTION;

export const metadata: Metadata = publicMetadata({ title, description, pathname: '/' });

const Pipeline = dynamic(() => import('@/components/landing/Pipeline').then((module) => module.Pipeline));
const FreshToday = dynamic(() => import('@/components/landing/FreshToday').then((module) => module.FreshToday));
const TwoWays = dynamic(() => import('@/components/landing/TwoWays').then((module) => module.TwoWays));
const Farmers = dynamic(() => import('@/components/landing/Farmers').then((module) => module.Farmers));
const Faq = dynamic(() => import('@/components/landing/Faq').then((module) => module.Faq));
const Download = dynamic(() => import('@/components/landing/Footer').then((module) => module.Download));
const Footer = dynamic(() => import('@/components/landing/Footer').then((module) => module.Footer));

export default async function Home() {
  let initialData: StorefrontPageData | undefined;
  let initialError = false;
  try {
    initialData = await fetchStorefrontPage(40);
  } catch (error) {
    console.error('Could not render initial homepage products:', error);
    initialError = true;
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd({
        '@context': 'https://schema.org',
        '@graph': [
          {
            '@type': 'Organization',
            '@id': 'https://www.saplaya.org/#organization',
            name: 'Saplaya Organization',
            alternateName: 'Saplaya',
            legalName: 'SAPLAYA ORGANIZATION LIMITED',
            url: 'https://www.saplaya.org/',
            logo: 'https://www.saplaya.org/saplaya-icon.png',
            description: MARKETPLACE_DESCRIPTION,
            areaServed: { '@type': 'Country', name: 'Tanzania' },
          },
          {
            '@type': 'WebSite',
            '@id': 'https://www.saplaya.org/#website',
            name: 'Saplaya Organization',
            url: `${SITE_URL}/`,
            publisher: { '@id': 'https://www.saplaya.org/#organization' },
          },
        ],
      }) }} />
      <Nav />
      <main>
        <Hero initialData={initialData} initialError={initialError} />
        <Pipeline />
        <FreshToday initialData={initialData} initialError={initialError} />
        <TwoWays />
        <Farmers />
        <Faq />
        <Download />
      </main>
      <Footer />
    </>
  );
}
