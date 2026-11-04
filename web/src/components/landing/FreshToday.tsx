'use client';

import { useEffect, useState } from 'react';
import { Sprout } from 'lucide-react';
import { SmartImage } from '@/components/ui/SmartImage';
import { localDayPeriod, type LocalDayPeriod } from '@/lib/format';
import { useStorefrontProducts } from '@/lib/storefront';
import { useGlobalMarket } from '@/lib/global-market';

export function FreshToday() {
  const market = useGlobalMarket();
  const { products, loading, error, retry } = useStorefrontProducts(40, market.location);
  const [localPeriod, setLocalPeriod] = useState<LocalDayPeriod | null>(null);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});

  const sections = [
    { key: 'fresh', title: 'Fresh produce' },
    { key: 'grains', title: 'Grains & pulses' },
    { key: 'essentials', title: 'Cooking essentials' },
  ].map((section) => {
    const matches = products.filter((product) => {
      const category = product.category.toLocaleLowerCase();
      const group = /grain|pulse|legume|bean|rice|maize|millet|cereal/.test(category)
        ? 'grains'
        : /fruit|veget|produce|leaf|herb|flower/.test(category)
          ? 'fresh'
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
    const updateLocalPeriod = () => setLocalPeriod(localDayPeriod());
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
          Nearby stocked farms appear first; results widen to farther suppliers when nearby options are limited.
        </p>
        {market.location && (
          <p className="mt-2 text-sm font-semibold text-leaf-deep">
            Current location {market.location.lat.toFixed(4)}, {market.location.lng.toFixed(4)}
            {' · '}GPS accuracy about {Math.round(market.location.accuracy)} m · sorted closest first
          </p>
        )}
        {market.ratesLoading && market.currency !== 'TZS' ? (
          <p role="status" className="mt-2 text-sm text-ink-soft">
            Loading the approximate {market.currency} display rate; payment remains in TZS.
          </p>
        ) : market.ratesUnavailable ? (
          <p role="status" className="mt-2 text-sm font-semibold text-amber-800">
            Currency conversion is unavailable; prices are shown in TZS.
          </p>
        ) : market.currency !== 'TZS' ? (
          <p className="mt-2 text-sm text-ink-soft">
            Approximate {market.currency} display using the rate dated {market.exchangeUpdatedAt}; orders are charged in TZS.
          </p>
        ) : null}

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
        ) : (
          <div className="mt-12 space-y-12">
            {sections.map((section) => (
              <div key={section.key}>
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="font-display text-2xl font-extrabold">{section.title}</h3>
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
                <div className="grid grid-cols-2 gap-3 sm:gap-4">
                  {section.products.map((product) => (
                    <article key={product.id} className="group relative aspect-[4/5] overflow-hidden rounded-[1.75rem] bg-line">
                      <SmartImage
                        src={product.image_url ?? undefined}
                        alt={product.name}
                        className="absolute inset-0 text-6xl"
                        imgClassName="transition duration-700 group-hover:scale-105"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-ink/80 via-ink/10 to-transparent" />
                      <div className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-1.5 text-xs font-bold text-leaf-deep">
                        <Sprout size={14} /> Harvested {Math.max(0, Math.floor((Date.now() - Date.parse(product.harvested_at)) / 3_600_000))} hours ago
                      </div>
                      <div className="absolute inset-x-4 bottom-4 text-white">
                        <h4 className="font-display text-xl font-extrabold">{product.name}</h4>
                        <p className="mt-0.5 font-bold text-sun">
                          {market.formatPrice(product.retail_price)} <span className="text-sm font-medium text-white/80">per {product.unit}</span>
                        </p>
                        {typeof product.farm_distance_km === 'number' && (
                          <p className="text-xs font-semibold text-white/80">{product.farm_distance_km.toFixed(1)} km away</p>
                        )}
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
