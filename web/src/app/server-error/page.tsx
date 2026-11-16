import type { Metadata } from 'next';
import { CircleAlert } from 'lucide-react';
import ErrorPageLayout from '@/components/error-layout';

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function ServiceUnavailablePage() {
  return (
    <ErrorPageLayout
      title="Something went wrong"
      description="We couldn’t complete that request. Please try again in a moment."
      icon={<CircleAlert size={32} aria-hidden="true" />}
      primaryHref="/"
      primaryLabel="Return to Saplaya"
    />
  );
}
