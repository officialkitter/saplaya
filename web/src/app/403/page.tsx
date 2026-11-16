import type { Metadata } from 'next';
import { ShieldAlert } from 'lucide-react';
import ErrorPageLayout from '@/components/error-layout';

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function AccessUnavailablePage() {
  return (
    <ErrorPageLayout
      title="This page isn’t available to your account"
      description="Your current account may not have access here. Contact your Saplaya administrator if you think you should."
      icon={<ShieldAlert size={32} aria-hidden="true" />}
      primaryHref="/"
      primaryLabel="Back to Saplaya"
    />
  );
}
