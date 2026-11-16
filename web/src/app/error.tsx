'use client';

import { useEffect } from 'react';
import { CircleAlert } from 'lucide-react';
import ErrorPageLayout from '@/components/error-layout';
import { logSafeError } from '@/lib/user-facing-error';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    logSafeError('Saplaya page rendering failed.', error);
  }, [error]);

  return (
    <ErrorPageLayout
      title="Something went wrong"
      description="We couldn’t load this page just now. Please try again."
      icon={<CircleAlert size={32} aria-hidden="true" />}
      onPrimaryAction={reset}
      primaryLabel="Try again"
    />
  );
}
