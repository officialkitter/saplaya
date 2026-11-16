'use client';

import { useEffect } from 'react';
import { CircleAlert } from 'lucide-react';
import ErrorPageLayout from '@/components/error-layout';
import { logSafeError } from '@/lib/user-facing-error';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    logSafeError('Saplaya application rendering failed.', error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <ErrorPageLayout
          title="Saplaya is having a moment"
          description="We couldn’t load the page just now. Please try again or return to the shop."
          icon={<CircleAlert size={32} aria-hidden="true" />}
          onPrimaryAction={reset}
          primaryLabel="Try again"
        />
      </body>
    </html>
  );
}
