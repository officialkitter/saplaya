'use client';

import Link from 'next/link';
import { Smartphone } from 'lucide-react';
import { Logo } from '@/components/ui/Logo';
import { useGlobalMarket } from '@/lib/global-market';

export function Download() {
  return (
    <section id="download" className="px-5 pb-20">
      <div className="mx-auto max-w-7xl overflow-hidden rounded-[2.5rem] bg-sun px-8 py-14 sm:px-14">
        <div className="flex flex-col items-start justify-between gap-8 lg:flex-row lg:items-center">
          <div>
            <h2 className="max-w-lg font-display text-4xl font-extrabold leading-tight tracking-tight text-ink sm:text-5xl">
              Fresh food is one tap away.
            </h2>
            <p className="mt-3 max-w-md text-lg text-ink/75">Get Saplaya on your phone and order from farms near you.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            {['Google Play', 'App Store'].map((s) => (
              <span key={s} className="inline-flex h-16 items-center gap-3 rounded-2xl bg-ink px-6 text-white">
                <Smartphone size={26} />
                <span className="leading-tight">
                  <span className="block text-xs text-white/70">Coming soon on</span>
                  <span className="block text-lg font-extrabold">{s}</span>
                </span>
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export function Footer() {
  const { location, placeName, placeNameStatus, marketAccent } = useGlobalMarket();
  return (
    <footer className="border-t border-line bg-white">
      <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-6 px-5 py-10 sm:flex-row sm:items-center">
        <Logo />
        <p className="max-w-full rounded-full px-3 py-1 text-sm font-bold text-white" style={{ backgroundColor: marketAccent }}>
          {location
            ? <>{placeNameStatus === 'ready' ? placeName : placeNameStatus === 'loading' ? 'Finding location…' : 'Location name unavailable'}{placeNameStatus === 'ready' && ' · Google Maps'}</>
            : 'Global marketplace'}
        </p>
        <nav className="flex flex-wrap gap-x-6 gap-y-2 text-[15px] font-semibold text-ink-soft" aria-label="Footer">
          <a href="#how" className="hover:text-leaf">How it works</a>
          <a href="#farmers" className="hover:text-leaf">Sell on Saplaya</a>
          <a href="#faq" className="hover:text-leaf">Questions</a>
          <Link href="/privacy" className="hover:text-leaf">Privacy policy</Link>
          <Link href="/login" className="hover:text-leaf">Member sign in</Link>
        </nav>
        <p className="text-sm text-ink-mute">&copy; 2026 Saplaya. Location access is optional and used to prioritize nearby farms.</p>
      </div>
    </footer>
  );
}
