import type { Metadata } from 'next';
import { Faq } from '@/components/landing/Faq';
import { PublicPage } from '@/components/landing/PublicPage';
import { FAQ_ITEMS } from '@/lib/faq-content';
import { serializeJsonLd } from '@/lib/json-ld';

export const metadata: Metadata = {
  title: 'Questions | Saplaya',
  description: 'Find answers about Saplaya delivery, payment methods, wholesale shopping, customer privacy and joining as a farm supplier.',
  alternates: { canonical: '/faq' },
};

export default function QuestionsPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd({
          '@context': 'https://schema.org',
          '@type': 'FAQPage',
          mainEntity: FAQ_ITEMS.map(({ q, a }) => ({
            '@type': 'Question',
            name: q,
            acceptedAnswer: { '@type': 'Answer', text: a },
          })),
        }) }}
      />
      <PublicPage pathname="/faq" title="Questions" description="Get help with shopping, delivery, payments and supplying produce on Saplaya." parents={[{ href: '/help', label: 'Help' }]}>
      <Faq />
      </PublicPage>
    </>
  );
}
