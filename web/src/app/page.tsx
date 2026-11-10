import dynamic from 'next/dynamic';
import type { Metadata } from 'next';
import { Nav } from '@/components/landing/Nav';
import { Hero } from '@/components/landing/Hero';

const title = 'Saplaya | Farm produce supplies and delivery';
const description = 'Shop fresh farm produce and pantry essentials for delivery. Explore retail and wholesale options and connect with Saplaya as a supplier.';

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
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'Organization',
        name: 'Saplaya',
        url: 'https://www.saplaya.org',
        logo: 'https://www.saplaya.org/saplaya-icon.png',
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
