'use client';

import { useEffect, useState } from 'react';
import { Grid2X2, LayoutGrid, Search, ShoppingBasket, Sprout, X } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import Link from 'next/link';
import { SmartImage } from '@/components/ui/SmartImage';
import { localDayPeriod, type LocalDayPeriod } from '@/lib/format';
import { useStorefrontProducts, type StorefrontFilters, type StorefrontProduct } from '@/lib/storefront';
import { useGlobalMarket } from '@/lib/global-market';
import { useStorefrontCart } from '@/lib/cart';
import { volumePrice, volumeTheme, volumeTier } from '@/lib/volume';
import { ModeSlide } from './ModeSlide';

function ProductCard({ product, fresh, compact, fillRow, onAdded }: {
  product: StorefrontProduct;
  fresh: boolean;
  compact: boolean;
  fillRow: boolean;
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
      className={`group relative overflow-hidden rounded-[1.5rem] bg-line shadow-soft transition-shadow hover:shadow-lift motion-reduce:transition-none ${fillRow ? compact ? 'col-span-2 sm:col-span-1' : 'min-[400px]:col-span-2 lg:col-span-1' : ''}`}
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
        className={`relative block aspect-[4/3] w-full overflow-hidden focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-[-4px] focus-visible:outline-leaf ${compact ? 'min-h-[10rem]' : 'min-h-[13rem]'} ${fillRow ? compact ? 'aspect-[2/1] sm:aspect-[4/3]' : 'min-[400px]:aspect-[2/1] lg:aspect-[4/3]' : ''}`}
      >
        <SmartImage
          src={product.image_url ?? undefined}
          alt={product.name}
          className="absolute inset-0 text-6xl"
          imgClassName="motion-safe:transition motion-safe:duration-700 motion-safe:group-hover:scale-105"
        />
      </button>
      {revealed && (
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.2 }}
          className="absolute inset-x-0 bottom-0 max-h-full overflow-y-auto rounded-t-2xl border-t border-white/80 bg-white/95 p-3 shadow-lg backdrop-blur-md"
        >
          <div className="flex items-start gap-2">
            <h4 className="min-w-0 flex-1 break-words font-display text-lg font-extrabold leading-6 text-ink" title={product.name}>{product.name}</h4>
            <button type="button" aria-label={`Hide details for ${product.name}`} onClick={() => { setPinned(false); setHovered(false); }} className="grid h-11 w-11 shrink-0 place-items-center rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-leaf">
              <X size={18} aria-hidden />
            </button>
          </div>
          <p className="text-xs font-semibold text-ink-soft">{product.category} · sold per {product.unit}</p>
          {fresh && <p className="flex items-center gap-1 text-xs font-bold text-leaf-deep"><Sprout size={14} aria-hidden /> Harvested within 24 hours</p>}
          <p className="mt-1 flex flex-wrap items-baseline gap-x-1 font-bold" style={{ color: theme.accent }}>
            <span>{price === null ? 'Price confirmed at checkout' : market.formatPrice(price)}</span> <span className="text-sm font-medium text-ink-mute">per {product.unit}</span>
          </p>
          {typeof product.farm_distance_km === 'number' && <p className="mt-1 text-xs font-semibold text-ink-mute">{product.farm_distance_km.toFixed(1)} km away</p>}
          {tier !== 'retail' && <p className="mt-1 text-xs font-bold" style={{ color: theme.accent }}>{tier === 'mega_bulk' ? 'Mega-bulk' : tier === 'bulk' ? 'Bulk' : 'Wholesale'} price</p>}
          {qty > 0 && <p className="mt-1 text-sm font-semibold text-ink-soft">{qty} {product.unit} in your basket</p>}
          <motion.button
            type="button"
            disabled={product.stock < 1 || qty >= Math.min(product.stock, 10000)}
            onClick={() => { add(product); onAdded(product); }}
            whileTap={reduceMotion ? undefined : { scale: 0.96 }}
            className="mt-2 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-2 py-2 text-sm font-extrabold shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            style={{ backgroundColor: theme.button, color: theme.buttonText }}
          >
            <motion.span key={qty} initial={reduceMotion ? false : { scale: 0.75 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 400, damping: 14 }}>
              <ShoppingBasket size={18} aria-hidden />
            </motion.span>
            {product.stock < 1 ? 'Currently unavailable' : qty >= Math.min(product.stock, 10000) ? 'Maximum available in basket' : qty ? 'Add another' : 'Add to basket'}
          </motion.button>
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
  const [compact, setCompact] = useState(false);
  const reduceMotion = useReducedMotion();
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

  useEffect(() => {
    if (!basketNotice) return;
    const timer = setTimeout(() => setBasketNotice(null), 3500);
    return () => clearTimeout(timer);
  }, [basketNotice]);

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
      products: expandedSections[section.key] ? matches : matches.slice(0, 3),
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
    <section id="fresh" className="py-12 sm:py-16" style={{ backgroundColor: theme.background }}>
      <div className="mx-auto max-w-7xl px-5">
        <h2 className="max-w-xl font-display text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">
          On the shelf {localPeriod ? `this ${localPeriod}` : 'today'}.
        </h2>
        <p className="mt-4 max-w-xl text-lg text-ink-soft">
          Find ingredients for everyday meals or stock up for your business, with produce from farms and pantry essentials in one place.
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
              ? <>Discover stocked farms near {market.placeName} · Google Maps.</>
              : market.placeNameStatus === 'loading'
                ? 'Finding where you are…'
                : 'Nearby farms are prioritized. Your place name is unavailable.'}
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
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-ink-soft">Choose a view that suits you.</p>
            <div role="group" aria-label="Product grid size" className="inline-flex rounded-2xl border border-white/80 bg-white/80 p-1 shadow-soft backdrop-blur-sm">
              <button type="button" aria-pressed={!compact} onClick={() => setCompact(false)} className={`flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-sm font-bold ${!compact ? 'bg-leaf text-white' : 'text-ink-soft hover:bg-leaf-soft'}`}><Grid2X2 size={17} aria-hidden /> Large</button>
              <button type="button" aria-pressed={compact} onClick={() => setCompact(true)} className={`flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-sm font-bold ${compact ? 'bg-leaf text-white' : 'text-ink-soft hover:bg-leaf-soft'}`}><LayoutGrid size={17} aria-hidden /> Compact</button>
            </div>
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
          <div className="mt-8 space-y-9">
            {sections.map((section) => (
              <div key={section.key}>
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="font-display text-xl font-extrabold sm:text-2xl">{section.title}</h3>
                    <p className="mt-1 text-sm text-ink-soft">{section.description}</p>
                  </div>
                  {!searching && section.total > 3 && (
                    <button
                      type="button"
                      aria-expanded={Boolean(expandedSections[section.key])}
                      aria-controls={`section-products-${section.key}`}
                      onClick={() => setExpandedSections((current) => ({ ...current, [section.key]: !current[section.key] }))}
                      className="min-h-11 rounded-xl px-2 font-bold text-leaf-deep underline"
                    >
                      {expandedSections[section.key] ? 'See less' : 'See more'}
                    </button>
                  )}
                </div>
                <div id={`section-products-${section.key}`} className={`grid gap-3 sm:gap-4 ${compact ? `grid-cols-2 sm:grid-cols-3 ${section.products.length > 3 ? 'xl:grid-cols-4' : ''}` : 'grid-cols-1 min-[400px]:grid-cols-2 lg:grid-cols-3'}`}>
                  {section.products.map((product, index) => (
                    <ProductCard
                      key={product.id}
                      product={product}
                      fresh={section.key === 'fresh'}
                      compact={compact}
                      fillRow={index === section.products.length - 1 && section.products.length % 2 === 1}
                      onAdded={(item) => setBasketNotice({ id: item.id, name: item.name, unit: item.unit })}
                    />
                  ))}
                </div>
              </div>
            ))}
            {hasMore && <button type="button" onClick={() => void loadMore()} className="min-h-11 rounded-xl px-3 font-bold text-leaf-deep underline">Load more products</button>}
          </div>
        )}
      </div>
      <span role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {basketNotice && `${basketNotice.name} added. ${lines.find((line) => line.product.id === basketNotice.id)?.qty ?? 0} ${basketNotice.unit} in your basket.`}
      </span>
      <AnimatePresence>
        {basketNotice && (
          <motion.div initial={reduceMotion ? false : { opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: reduceMotion ? 0 : 16 }} className="fixed inset-x-3 bottom-3 z-50 mx-auto flex max-w-md items-center gap-2 rounded-2xl border border-white/80 bg-white/95 px-3 py-2 shadow-lift backdrop-blur-md">
            <p aria-hidden="true" className="min-w-0 flex-1 break-words text-sm font-bold text-ink">
              {basketNotice.name} added · {lines.find((line) => line.product.id === basketNotice.id)?.qty ?? 0} {basketNotice.unit}
            </p>
            <Link href="/checkout" className="shrink-0 rounded-xl px-3 py-2 text-sm font-extrabold" style={{ backgroundColor: theme.button, color: theme.buttonText }}>Basket</Link>
            <button type="button" onClick={() => setBasketNotice(null)} aria-label="Dismiss basket notification" className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-xl text-ink-soft"><span aria-hidden="true">×</span></button>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
