'use client';

import { useEffect, useState } from 'react';
import { Search, Sprout, X } from 'lucide-react';
import { SmartImage } from '@/components/ui/SmartImage';
import { localDayPeriod, type LocalDayPeriod } from '@/lib/format';
import { useStorefrontProducts } from '@/lib/storefront';
import { useGlobalMarket } from '@/lib/global-market';
import { useStorefrontCart } from '@/lib/cart';

export function FreshToday() {
  const market = useGlobalMarket();
  const { add } = useStorefrontCart();
  const { products, loading, error, retry } = useStorefrontProducts(40, market.location);
  const [localPeriod, setLocalPeriod] = useState<LocalDayPeriod | null>(null);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});
  const [now, setNow] = useState(0);
  const [query, setQuery] = useState('');
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleProducts = products.filter((product) =>
    !normalizedQuery
    || product.name.toLocaleLowerCase().includes(normalizedQuery)
    || product.category.toLocaleLowerCase().includes(normalizedQuery),
  );

  const sections = [
    { key: 'fresh', title: 'Fresh today', description: 'Harvested within the last 24 hours.' },
    { key: 'holisticare', title: 'Holisticare', description: 'Vegetables, fruits, herbs and other garden produce.' },
    { key: 'grains', title: 'Grains & pulses', description: 'Everyday grains, cereals, beans and pulses.' },
    { key: 'essentials', title: 'Cooking essentials', description: 'Pantry staples including oils, sauces, spices and more.' },
  ].map((section) => {
    const matches = visibleProducts.filter((product) => {
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
    <section id="fresh" className="py-20 lg:py-28">
      <div className="mx-auto max-w-7xl px-5">
        <h2 className="max-w-xl font-display text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">
          On the shelf {localPeriod ? `this ${localPeriod}` : 'today'}.
        </h2>
        <p className="mt-4 max-w-xl text-lg text-ink-soft">
          Explore farm produce and pantry essentials. Allow location access to prioritize nearby stocked farms.
        </p>
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

        {!loading && !error && products.length > 0 && (
          <label className="relative mt-6 block max-w-xl">
            <span className="sr-only">Search products</span>
            <Search size={19} aria-hidden className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-mute" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search products or categories"
              className="w-full rounded-2xl border border-line bg-white py-3 pl-11 pr-11 text-base shadow-soft placeholder:text-ink-mute"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="absolute right-3 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full text-ink-mute hover:bg-leaf-soft"
                aria-label="Clear product search"
              >
                <X size={17} />
              </button>
            )}
          </label>
        )}

        {loading ? (
          <div className="mt-12 grid grid-cols-2 gap-3 sm:gap-4" aria-label="Loading available products">
            {Array.from({ length: 4 }, (_, index) => (
              <div key={index} className="aspect-[4/5] animate-pulse rounded-[1.75rem] bg-line" />
            ))}
          </div>
        ) : error ? (
          <div className="mt-12 rounded-3xl border border-line bg-white p-8 text-center">
            <p className="font-bold text-ink">Products are temporarily unavailable.</p>
            <button type="button" onClick={retry} className="mt-4 font-bold text-leaf-deep underline">Try again</button>
          </div>
        ) : products.length === 0 ? (
          <div className="mt-12 rounded-3xl border border-line bg-white p-8 text-center text-ink-soft">
            <p className="font-bold text-ink">No items are in stock right now.</p>
            <p className="mt-2">New listings will appear here as farms add approved prices and available stock.</p>
          </div>
        ) : visibleProducts.length === 0 ? (
          <div className="mt-8 rounded-3xl border border-line bg-white p-8 text-center text-ink-soft">
            <p className="font-bold text-ink">No products match “{query}”.</p>
            <button type="button" onClick={() => setQuery('')} className="mt-3 font-bold text-leaf-deep underline">
              Clear search
            </button>
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
                  {section.total > 6 && (
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
                    <article key={product.id} className="group overflow-hidden rounded-[1.75rem] bg-white shadow-soft">
                      <div className="relative aspect-[4/3] overflow-hidden bg-line">
                        <SmartImage
                          src={product.image_url ?? undefined}
                          alt={product.name}
                          className="absolute inset-0 text-6xl"
                          imgClassName="transition duration-700 group-hover:scale-105"
                        />
                        {section.key === 'fresh' && (
                          <div className="absolute left-3 top-3 flex max-w-[calc(100%-1.5rem)] items-center gap-1.5 rounded-full bg-white/95 px-3 py-1.5 text-xs font-bold text-leaf-deep">
                            <Sprout size={14} className="shrink-0" /> Harvested within 24 hours
                          </div>
                        )}
                      </div>
                      <div className="p-3 sm:p-4">
                        <h4 className="line-clamp-2 min-h-[3rem] break-words font-display text-lg font-extrabold leading-6 text-ink sm:text-xl" title={product.name}>{product.name}</h4>
                        <p className="mt-0.5 flex flex-wrap items-baseline gap-x-1 font-bold text-leaf-deep">
                          <span>{market.formatPrice(product.retail_price)}</span> <span className="text-sm font-medium text-ink-mute">per {product.unit}</span>
                        </p>
                        {typeof product.farm_distance_km === 'number' && (
                          <p className="mt-1 text-xs font-semibold text-ink-mute">{product.farm_distance_km.toFixed(1)} km away</p>
                        )}
                        <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Available volume price tiers">
                          <span className="rounded-full bg-[#EFEBE9] px-2 py-1 text-[10px] font-bold text-[#5D4037]">
                            Wholesale · {market.formatPrice(product.wholesale_price)} from {product.wholesale_min_qty}
                          </span>
                          {product.bulk_price !== null && (
                            <span className="rounded-full bg-[#E0F2F1] px-2 py-1 text-[10px] font-bold text-[#00695C]">
                              Bulk · {market.formatPrice(product.bulk_price)}
                            </span>
                          )}
                          {product.mega_bulk_price !== null && (
                            <span className="rounded-full bg-[#EFEBE9] px-2 py-1 text-[10px] font-bold text-[#4E342E]">
                              Mega-bulk · {market.formatPrice(product.mega_bulk_price)}
                            </span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => add(product)}
                          className="mt-3 w-full rounded-xl bg-leaf px-4 py-2.5 text-sm font-extrabold text-white transition hover:bg-leaf-deep focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-leaf"
                        >
                          Add to basket
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
