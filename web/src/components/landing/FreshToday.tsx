'use client';

import { useEffect, useState } from 'react';
import { Sprout } from 'lucide-react';
import { SmartImage } from '@/components/ui/SmartImage';
import { formatTZS, localDayPeriod, type LocalDayPeriod } from '@/lib/format';
import { useStorefrontProducts } from '@/lib/storefront';

export function FreshToday() {
  const { products, loading, error, retry } = useStorefrontProducts(8);
  const [localPeriod, setLocalPeriod] = useState<LocalDayPeriod | null>(null);

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
          Browse real farm listings, live prices and current availability.
        </p>

        {loading ? (
          <div className="mt-12 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4" aria-label="Loading available products">
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
          <div className="mt-12 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            {products.map((product, i) => (
              <article
                key={product.id}
                className={`group relative overflow-hidden rounded-[1.75rem] bg-line ${i === 0 ? 'col-span-2 row-span-2 min-h-[320px] lg:min-h-0' : 'aspect-[4/5]'}`}
              >
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
                  <h3 className={`font-display font-extrabold ${i === 0 ? 'text-3xl' : 'text-xl'}`}>{product.name}</h3>
                  <p className="mt-0.5 font-bold text-sun">
                    {formatTZS(product.retail_price)} <span className="text-sm font-medium text-white/80">per {product.unit}</span>
                  </p>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
