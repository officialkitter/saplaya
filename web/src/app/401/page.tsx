import type { Metadata } from 'next';
import { KeyRound } from 'lucide-react';
import ErrorPageLayout from '@/components/error-layout';

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function SignInRequiredPage() {
  return (
    <ErrorPageLayout
      title="Please sign in to continue"
      description="Sign in to your Saplaya account to continue. If you already signed in, try opening the page again."
      icon={<KeyRound size={32} aria-hidden="true" />}
      primaryHref="/login"
      primaryLabel="Sign in"
    />
  );
}
