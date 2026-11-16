'use client';

'use client';

import React from 'react';
import Link from 'next/link';
import { LogoMark } from '@/components/ui/Logo';

interface ErrorPageProps {
  statusCode?: number;
  title: string;
  description: string;
  icon: React.ReactNode;
  primaryHref?: string;
  primaryLabel?: string;
  onPrimaryAction?: () => void;
}

export default function ErrorPageLayout({
  statusCode,
  title,
  description,
  icon,
  primaryHref = '/',
  primaryLabel = 'Back to Saplaya',
  onPrimaryAction,
}: ErrorPageProps) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-milk px-5 py-10">
      <section className="w-full max-w-xl rounded-[2rem] border border-line bg-white p-8 text-center shadow-lift sm:p-10">
        <div className="mb-8 flex items-center justify-center gap-3">
          <LogoMark size={44} />
          <span className="font-display text-2xl font-extrabold text-ink">Saplaya</span>
        </div>
        <div className="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-2xl bg-leaf-soft text-leaf">{icon}</div>
        {statusCode && <p className="text-sm font-extrabold uppercase tracking-[0.18em] text-leaf-deep">{statusCode}</p>}
        <h1 className="mt-2 font-display text-3xl font-extrabold text-ink sm:text-4xl">{title}</h1>
        <p className="mx-auto mt-3 max-w-md text-ink-soft">{description}</p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          {onPrimaryAction ? (
            <button type="button" onClick={onPrimaryAction} className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-leaf px-6 py-3 font-extrabold text-white transition hover:bg-leaf-deep">
              {primaryLabel}
            </button>
          ) : (
            <Link href={primaryHref} className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-leaf px-6 py-3 font-extrabold text-white transition hover:bg-leaf-deep">
              {primaryLabel}
            </Link>
          )}
          <button type="button" onClick={() => window.history.back()} className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-line px-6 py-3 font-bold text-ink transition hover:bg-milk">
            Go back
          </button>
        </div>
        <p className="mt-8 text-sm text-ink-soft">
          Need help? <Link href="/faq" className="font-bold text-leaf-deep underline">Visit our FAQ</Link>
        </p>
      </section>
    </main>
  );
}
