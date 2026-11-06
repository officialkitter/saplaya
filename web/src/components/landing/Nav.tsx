'use client';

import { AnimatePresence, motion } from 'framer-motion';
import Link from 'next/link';
import { MapPin, Menu, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Logo } from '@/components/ui/Logo';
import { LinkButton } from '@/components/ui/Button';
import { useGlobalMarket } from '@/lib/global-market';

const LINKS = [
  { href: '#how', label: 'How it works' },
  { href: '#fresh', label: 'Fresh today' },
  { href: '#farmers', label: 'For farmers' },
  { href: '#faq', label: 'Questions' },
];

export function Nav() {
  const [open, setOpen] = useState(false);
  const requested = useRef(false);
  const { location, locationError, requestLocation, clearLocation, currency, setCurrency, currencies } = useGlobalMarket();
  useEffect(() => {
    if (requested.current) return;
    requested.current = true;
    requestLocation();
  }, [requestLocation]);
  const marketControls = (id: string) => (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={location ? clearLocation : requestLocation}
        className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-line bg-white px-3 py-2 text-sm font-bold text-ink-soft transition hover:bg-leaf-soft"
        aria-label={location ? 'Stop using your current location' : 'Use your current location to find nearby farms'}
      >
        <MapPin size={16} aria-hidden />{location ? 'Location on · Clear' : 'Use my location'}
      </button>
      <label className="sr-only" htmlFor={id}>Display currency</label>
      <select
        id={id}
        value={currency}
        onChange={(event) => setCurrency(event.target.value)}
        className="h-10 rounded-xl border border-line bg-white px-2 text-sm font-bold text-ink"
        aria-label="Display currency"
      >
        {currencies.map((code) => <option key={code} value={code}>{code}</option>)}
      </select>
    </div>
  );
  return (
    <header className="sticky top-0 z-40 border-b border-line/70 bg-milk/95 shadow-sm backdrop-blur-md">
      <div className="mx-auto flex min-h-[72px] max-w-[1600px] items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" aria-label="Saplaya home">
          <Logo grow />
        </Link>
        <nav className="hidden shrink-0 items-center gap-1 xl:flex" aria-label="Main">
          {LINKS.map((l) => (
            <a key={l.href} href={l.href} className="whitespace-nowrap rounded-full px-3 py-2 text-[15px] font-semibold text-ink-soft transition hover:bg-leaf-soft hover:text-leaf-deep">
              {l.label}
            </a>
          ))}
        </nav>
        <div className="hidden shrink-0 items-center gap-2 xl:flex">
          {marketControls('market-currency-desktop')}
          <LinkButton href="/login" variant="ghost">Member sign in</LinkButton>
          <LinkButton href="#download" variant="sun">Get the app</LinkButton>
        </div>
        <button className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-ink hover:bg-leaf-soft xl:hidden" aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open} aria-controls="mobile-menu" onClick={() => setOpen((o) => !o)}>
          {open ? <X size={26} /> : <Menu size={26} />}
        </button>
      </div>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            id="mobile-menu"
            className="max-h-[calc(100dvh-72px)] overflow-y-auto border-t border-line bg-milk xl:hidden"
          >
            <div className="flex flex-col gap-1 px-5 py-4">
              {marketControls('market-currency-mobile')}
              {LINKS.map((l) => (
                <a key={l.href} href={l.href} onClick={() => setOpen(false)} className="rounded-xl px-3 py-3 text-lg font-semibold text-ink hover:bg-leaf-soft">
                  {l.label}
                </a>
              ))}
              <div className="mt-2 grid grid-cols-2 gap-2">
                <LinkButton href="/login" variant="soft">Member sign in</LinkButton>
                <LinkButton href="#download" variant="sun">Get the app</LinkButton>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {locationError && <p role="status" className="mx-auto max-w-7xl px-5 pb-2 text-xs font-semibold text-red-700">{locationError} You can continue browsing.</p>}
    </header>
  );
}
