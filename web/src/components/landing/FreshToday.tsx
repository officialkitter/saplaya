'use client';

import { useEffect, useState } from 'react';
import { Search, ShoppingBasket, Sprout, X } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import Link from 'next/link';
import { SmartImage } from '@/components/ui/SmartImage';
import { localDayPeriod, type LocalDayPeriod } from '@/lib/format';
import { useStorefrontProducts, type StorefrontFilters, type StorefrontProduct } from '@/lib/storefront';
import { useGlobalMarket } from '@/lib/global-market';
import { useStorefrontCart } from '@/lib/cart';
import { volumePrice, volumeTheme, volumeTier } from '@/lib/volume';
import { ModeSlide } from './ModeSlide';

function ProductCard({ product, fresh, onAdded }: {
  product: StorefrontProduct;
  fresh: boolean;
  onAdded: (product: StorefrontProduct) => void;
}) {
  const [pinned, setPinned] = useState(false);
  const [hovered, setHovered] = useState(false);
  const reduceMotion = useReducedMotion();
  const market = useGlobalMarket();
  const { add, lines, mode, preferredMode } = useStorefrontCart();
  const theme = volumeTheme(mode);
  const qty = lines.find((line) => line.product.id === product.id)?.qty ?? 0;
  const tier = volumeTier(product, qty || 1, preferredMode);
  const price = volumePrice(product, qty || 1, preferredMode);
  const revealed = pinned || hovered;

  return (
    <article
      className="relative min-h-[15rem] overflow-hidden rounded-[1.75rem] bg-line shadow-soft"
      onPointerEnter={(event) => { if (event.pointerType === 'mouse') setHovered(true); }}
      onPointerLeave={(event) => {
        if (event.pointerType !== 'mouse') return;
        if (revealed && event.currentTarget.contains(document.activeElement)) setPinned(true);
        setHovered(false);
      }}
    >
      <button
        type="button"
        aria-label={`${pinned ? 'Hide' : 'Show'} details for ${product.name}`}
        aria-expanded={revealed}
        onClick={() => setPinned((value) => !value)}
        className="relative block aspect-[4/3] min-h-[15rem] w-full overflow-hidden focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-[-4px] focus-visible:outline-leaf"
      >
        <SmartImage
          src={product.image_url ?? undefined}
          alt={product.name}
          className="absolute inset-0 text-6xl"
          imgClassName="motion-safe:transition motion-safe:duration-700 motion-safe:hover:scale-105"
        />
      </button>
      {revealed && (
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.2 }}
          className="absolute inset-x-0 bottom-0 max-h-full overflow-y-auto rounded-t-2xl border-t border-white/70 bg-white/95 p-3 shadow-lg backdrop-blur-md sm:p-4"
        >
          <div className="flex items-start gap-2">
            <h4 className="min-w-0 flex-1 break-words font-display text-lg font-extrabold leading-6 text-ink" title={product.name}>{product.name}</h4>
            <button type="button" aria-label={`Hide details for ${product.name}`} onClick={() => { setPinned(false); setHovered(false); }} className="grid h-11 w-11 shrink-0 place-items-center rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-leaf">
              <X size={18} aria-hidden />
            </button>
          </div>
          {fresh && <p className="flex items-center gap-1 text-xs font-bold text-leaf-deep"><Sprout size={14} aria-hidden /> Harvested within 24 hours</p>}
          <p className="mt-1 flex flex-wrap items-baseline gap-x-1 font-bold" style={{ color: theme.accent }}>
            <span>{price === null ? 'Price confirmed at checkout' : market.formatPrice(price)}</span> <span className="text-sm font-medium text-ink-mute">per {product.unit}</span>
          </p>
          {typeof product.farm_distance_km === 'number' && <p className="mt-1 text-xs font-semibold text-ink-mute">{product.farm_distance_km.toFixed(1)} km away</p>}
          {tier !== 'retail' && <p className="mt-1 text-xs font-bold" style={{ color: theme.accent }}>{tier === 'mega_bulk' ? 'Mega-bulk' : tier === 'bulk' ? 'Bulk' : 'Wholesale'} price</p>}
          {qty > 0 && <p className="mt-1 text-sm font-semibold text-ink-soft">{qty} {product.unit} in your basket</p>}
          <button
            type="button"
            disabled={product.stock < 1 || qty >= Math.min(product.stock, 10000)}
            onClick={() => { add(product); onAdded(product); }}
            className="mt-2 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-extrabold shadow-sm transition-transform active:scale-[0.98] motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            style={{ backgroundColor: theme.button, color: theme.buttonText }}
          >
            <ShoppingBasket size={18} aria-hidden />
            {product.stock < 1 ? 'Currently unavailable' : qty >= Math.min(product.stock, 10000) ? 'Maximum available in basket' : qty ? 'Add another' : 'Add to basket'}
          </button>
        </motion.div>
      )}
    </article>
  );
}

export function FreshToday({ showShoppingMode = false }: { showShoppingMode?: boolean }) {
  const market = useGlobalMarket();
  const { lines, mode, preferredMode, setPreferredMode } = useStorefrontCart();
  const theme = volumeTheme(mode);
  const [localPeriod, setLocalPeriod] = useState<LocalDayPeriod | null>(null);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});
  const [now, setNow] = useState(0);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [fresh, setFresh] = useState(false);
  const [filters, setFilters] = useState<StorefrontFilters>({});
  const [basketNotice, setBasketNotice] = useState<{ id: string; name: string; unit: string } | null>(null);
  const { products, loading, error, retry, hasMore, categories, loadMore } = useStorefrontProducts(40, market.location, filters);
  const searching = Boolean(filters.query?.trim() || filters.category || filters.fresh);

  useEffect(() => {
    const initialQuery = new URLSearchParams(window.location.search).get('q');
    if (initialQuery) setQuery(initialQuery.slice(0, 100));
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setExpandedSections({});
      setFilters({ query, category, fresh });
    }, 300);
    return () => clearTimeout(timer);
  }, [query, category, fresh]);

  const sections = searching ? [{
    key: 'results', title: 'Search results', description: 'Products matching your selected filters.',
    products, total: products.length,
  }] : [
    { key: 'fresh', title: 'Fresh today', description: 'Harvested within the last 24 hours.' },
    { key: 'holisticare', title: 'Holisticare', description: 'Vegetables, fruits, herbs and other garden produce.' },
    { key: 'grains', title: 'Grains & pulses', description: 'Everyday grains, cereals, beans and pulses.' },
    { key: 'essentials', title: 'Cooking essentials', description: 'Pantry staples including oils, sauces, spices and more.' },
  ].map((section) => {
    const matches = products.filter((product) => {
      const category = product.category.toLocaleLowerCase();
      const harvested = Date.parse(product.harvested_at);
      if (section.key === 'fresh') {
        const age = now - harvested;
        return /fruit|veget|produce|leaf|herb|flower/.test(category)
          && now > 0 && Number.isFinite(harvested) && age >= 0 && age < 24 * 60 * 60 * 1000;
      }
      const group = /grain|pulse|legume|bean|rice|maize|millet|cereal/.test(category)
        ? 'grains'
        : /fruit|veget|produce|leaf|herb|flower/.test(category)
          ? 'holisticare'
          : 'essentials';
      return group === section.key;
    });
    return {
      ...section,
      products: expandedSections[section.key] ? matches : matches.slice(0, 6),
      total: matches.length,
    };
  }).filter((section) => section.total > 0);

  useEffect(() => {
    const updateLocalPeriod = () => {
      setLocalPeriod(localDayPeriod());
      setNow(Date.now());
    };
    updateLocalPeriod();
    const interval = setInterval(updateLocalPeriod, 60_000);
    return () => clearInterval(interval);
  }, []);

  return (
    <section id="fresh" className="py-20 lg:py-28" style={{ backgroundColor: theme.background }}>
      <div className="mx-auto max-w-7xl px-5">
        <h2 className="max-w-xl font-display text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">
          On the shelf {localPeriod ? `this ${localPeriod}` : 'today'}.
        </h2>
        <p className="mt-4 max-w-xl text-lg text-ink-soft">
          Explore farm produce and pantry essentials. Allow location access to prioritize nearby stocked farms.
        </p>
        {showShoppingMode && (
          <div className="mt-6">
            <ModeSlide wholesale={preferredMode === 'wholesale'} onChange={(wholesale) => setPreferredMode(wholesale ? 'wholesale' : 'retail')} />
            <p className="mt-3 text-ink-soft">Switch between retail and wholesale. Larger basket quantities unlock the existing volume prices.</p>
          </div>
        )}
        {market.location && (
          <p className="mt-2 text-sm font-semibold text-leaf-deep">
            {market.placeNameStatus === 'ready'
              ? <>Showing nearby farms in {market.placeName} · Google Maps. Your coordinates are not displayed.</>
              : market.placeNameStatus === 'loading'
                ? 'Finding the place name for your current location…'
                : 'Nearby farms are prioritized using your current location. The place name is unavailable.'}
          </p>
        )}
        {market.ratesLoading && market.currency !== 'TZS' ? (
          <p role="status" className="mt-2 text-sm text-ink-soft">
            Updating display prices.
          </p>
        ) : market.ratesUnavailable ? (
          <p role="status" className="mt-2 text-sm font-semibold text-amber-800">
            Currency conversion is temporarily unavailable.
          </p>
        ) : market.currency !== 'TZS' ? (
          <p className="mt-2 text-sm text-ink-soft">
            Approximate prices in {market.currency} · rate updated {market.exchangeUpdatedAt}.
          </p>
        ) : null}

        <div className="mt-6 max-w-3xl">
          <label className="relative block">
            <span className="sr-only">Search products</span>
            <Search size={19} aria-hidden className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-mute" />
            <input
              type="search"
              maxLength={100}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search products or categories"
              className="w-full rounded-2xl border bg-white py-3 pl-11 pr-4 text-base placeholder:text-ink-mute"
              style={{ borderColor: theme.button, backgroundColor: mode === 'wholesale' ? theme.soft : '#FFFFFF' }}
            />
          </label>
          <div className="mt-3 flex gap-2 overflow-x-auto pb-2" aria-label="Product filters">
            <button type="button" aria-pressed={fresh} onClick={() => setFresh(!fresh)} className="shrink-0 rounded-full border px-3 py-2 text-sm font-bold" style={fresh ? { color: theme.accent, backgroundColor: theme.soft, borderColor: theme.accent } : undefined}>Harvested today</button>
            {['', ...categories].map((value) => (
              <button key={value || 'all'} type="button" aria-pressed={category === value} onClick={() => setCategory(value)} className="shrink-0 rounded-full border px-3 py-2 text-sm font-bold" style={category === value ? { color: theme.accent, backgroundColor: theme.soft, borderColor: theme.accent } : undefined}>{value || 'All'}</button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="mt-12 grid grid-cols-2 gap-3 sm:gap-4" aria-label="Loading available products">
            {Array.from({ length: 4 }, (_, index) => (
              <div key={index} className="aspect-[4/5] animate-pulse rounded-[1.75rem] bg-line" />
            ))}
          </div>
        ) : error ? (
          <div className="mt-12 rounded-3xl border border-line bg-white p-8 text-center">
            <p className="font-bold text-ink">{filters.sort === 'nearby' && !market.location ? 'Allow location access to sort by nearby farms, or choose another sort.' : 'Products are temporarily unavailable.'}</p>
            <button type="button" onClick={retry} className="mt-4 font-bold text-leaf-deep underline">Try again</button>
          </div>
        ) : products.length === 0 ? (
          <div className="mt-12 rounded-3xl border border-line bg-white p-8 text-center text-ink-soft">
            <p className="font-bold text-ink">{searching ? 'No matching products.' : 'No items are in stock right now.'}</p>
            <p className="mt-2">{searching ? 'Try another search or change your filters.' : 'New listings will appear here as farms add approved prices and available stock.'}</p>
          </div>
        ) : (
          <div className="mt-12 space-y-12">
            {sections.map((section) => (
              <div key={section.key}>
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="font-display text-xl font-extrabold sm:text-2xl">{section.title}</h3>
                    <p className="mt-1 text-sm text-ink-soft">{section.description}</p>
                  </div>
                  {!searching && section.total > 6 && (
                    <button
                      type="button"
                      onClick={() => setExpandedSections((current) => ({ ...current, [section.key]: !current[section.key] }))}
                      className="font-bold text-leaf-deep underline"
                    >
                      {expandedSections[section.key] ? 'See less' : 'See more'}
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2 sm:gap-4 lg:grid-cols-3">
                  {section.products.map((product) => (
                    <ProductCard
                      key={product.id}
                      product={product}
                      fresh={section.key === 'fresh'}
                      onAdded={(item) => setBasketNotice({ id: item.id, name: item.name, unit: item.unit })}
                    />
                  ))}
                  {hasMore && <button type="button" onClick={() => void loadMore()} className="font-bold text-leaf-deep underline">Load more products</button>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <span role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {basketNotice && `${basketNotice.name} added. ${lines.find((line) => line.product.id === basketNotice.id)?.qty ?? 0} ${basketNotice.unit} in your basket.`}
      </span>
      {basketNotice && (
        <div className="fixed inset-x-4 bottom-4 z-50 mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-line bg-white p-4 shadow-lift">
          <p aria-hidden="true" className="min-w-0 flex-1 break-words text-sm font-bold text-ink">
            {basketNotice.name} added. {lines.find((line) => line.product.id === basketNotice.id)?.qty ?? 0} {basketNotice.unit} in your basket.
          </p>
          <Link href="/checkout" className="shrink-0 rounded-xl px-3 py-2 text-sm font-extrabold" style={{ backgroundColor: theme.button, color: theme.buttonText }}>
            View basket
          </Link>
          <button type="button" onClick={() => setBasketNotice(null)} aria-label="Dismiss basket notification" className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-xl text-ink-soft">
            <span aria-hidden="true">×</span>
          </button>
        </div>
      )}
    </section>
  );
}
