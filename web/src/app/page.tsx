import dynamic from 'next/dynamic';
import type { Metadata } from 'next';
import { Nav } from '@/components/landing/Nav';
import { Hero } from '@/components/landing/Hero';
import { serializeJsonLd } from '@/lib/json-ld';

const title = 'Saplaya | Fresh Produce Delivery & Wholesale';
const description = 'Shop fresh fruit, vegetables and farm produce with Saplaya. Order retail or wholesale for delivery, or apply to sell your harvest.';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    url: 'https://www.saplaya.org/',
    siteName: 'Saplaya',
    title,
    description,
    images: [{ url: '/saplaya-icon.png', alt: 'Saplaya' }],
  },
  twitter: { card: 'summary', title, description, images: ['/saplaya-icon.png'] },
};

const Pipeline = dynamic(() => import('@/components/landing/Pipeline').then((module) => module.Pipeline));
const FreshToday = dynamic(() => import('@/components/landing/FreshToday').then((module) => module.FreshToday));
const TwoWays = dynamic(() => import('@/components/landing/TwoWays').then((module) => module.TwoWays));
const Farmers = dynamic(() => import('@/components/landing/Farmers').then((module) => module.Farmers));
const Faq = dynamic(() => import('@/components/landing/Faq').then((module) => module.Faq));
const Download = dynamic(() => import('@/components/landing/Footer').then((module) => module.Download));
const Footer = dynamic(() => import('@/components/landing/Footer').then((module) => module.Footer));

export default function Home() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd({
        '@context': 'https://schema.org',
        '@graph': [
          {
            '@type': 'Organization',
            '@id': 'https://www.saplaya.org/#organization',
            name: 'Saplaya',
            url: 'https://www.saplaya.org/',
            logo: 'https://www.saplaya.org/saplaya-icon.png',
          },
          {
            '@type': 'WebSite',
            '@id': 'https://www.saplaya.org/#website',
            name: 'Saplaya',
            url: 'https://www.saplaya.org/',
            publisher: { '@id': 'https://www.saplaya.org/#organization' },
            potentialAction: {
              '@type': 'SearchAction',
              target: 'https://www.saplaya.org/fresh-today?q={search_term_string}',
              'query-input': 'required name=search_term_string',
            },
          },
        ],
      }) }} />
      <Nav />
      <main>
        <Hero />
        <Pipeline />
        <FreshToday />
        <TwoWays />
        <Farmers />
        <Faq />
        <Download />
      </main>
      <Footer />
    </>
  );
}
