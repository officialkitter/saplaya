import type { Metadata } from 'next';
import { SearchX } from 'lucide-react';
import ErrorPageLayout from '@/components/error-layout';

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function NotFound() {
  return (
    <ErrorPageLayout
      statusCode={404}
      title="We couldn’t find that page"
      description="The link may be out of date, or the page may have moved. You can head back to Saplaya and find what you need."
      icon={<SearchX size={32} aria-hidden="true" />}
    />
  );
}
