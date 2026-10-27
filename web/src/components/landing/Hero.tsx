'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { Bike, Sprout, Truck } from 'lucide-react';
import { useState } from 'react';
import { LinkButton } from '@/components/ui/Button';
import { BasketGraphic, CratesGraphic } from '@/components/ui/Graphics';
import { SmartImage } from '@/components/ui/SmartImage';
import { cn, formatTZS } from '@/lib/format';
import { useStorefrontProducts, type StorefrontProduct } from '@/lib/storefront';

/** The big slide toggle: same control the customer app uses. */
function ModeSlide({ wholesale, onChange }: { wholesale: boolean; onChange: (w: boolean) => void }) {
  return (
    <div role="group" aria-label="Shopping mode" className="relative flex h-[68px] w-full max-w-md rounded-full border-2 border-line bg-white p-1.5 shadow-soft">
      <motion.span
        aria-hidden
        className="absolute bottom-1.5 left-1.5 top-1.5 w-[calc(50%-6px)] rounded-full"
        animate={{ x: wholesale ? '100%' : '0%', backgroundColor: wholesale ? '#FFB300' : '#2E7D32' }}
        transition={{ type: 'spring', damping: 15, stiffness: 190 }}
      />
      {([false, true] as const).map((w) => (
        <button
          key={String(w)}
          aria-pressed={wholesale === w}
          onClick={() => onChange(w)}
          className={cn('relative z-10 flex-1 rounded-full text-lg font-extrabold transition-colors', wholesale === w ? (w ? 'text-ink' : 'text-white') : 'text-ink-mute')}
        >
          {w ? 'Wholesale' : 'Retail'}
        </button>
      ))}
    </div>
  );
}

function Phone({
  wholesale,
  products,
  loading,
  error,
}: {
  wholesale: boolean;
  products: StorefrontProduct[];
  loading: boolean;
  error: boolean;
}) {
  return (
    <div className="relative mx-auto h-[600px] w-[300px] rounded-[2.8rem] border-[10px] border-ink bg-milk shadow-lift">
      <div className="absolute left-1/2 top-2 z-20 h-5 w-24 -translate-x-1/2 rounded-full bg-ink" />
      <div className="relative h-full overflow-hidden rounded-[2.1rem]">
        {/* mode backdrop */}
        <div className="pointer-events-none absolute -right-8 top-14 h-56 w-56 opacity-[0.22]">
          <AnimatePresence mode="wait">
            <motion.div
              key={wholesale ? 'crates' : 'basket'}
              className="h-full w-full"
              initial={{ opacity: 0, scale: 0.7, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.8 }}
              transition={{ type: 'spring', damping: 14, stiffness: 180 }}
            >
              {wholesale ? <CratesGraphic className="h-full w-full" /> : <BasketGraphic className="h-full w-full" />}
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="relative px-4 pb-4 pt-9">
          <div className="flex items-center gap-2.5">
            <motion.span animate={{ x: [-3, 3, -3] }} transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }} className="grid h-9 w-9 place-items-center rounded-full bg-leaf text-white">
              <Truck size={18} />
            </motion.span>
            <div className="leading-tight">
              <p className="text-[11px] text-ink-mute">Local farm delivery</p>
              <p className="text-[15px] font-extrabold">Check your area in the app</p>
            </div>
          </div>

          <motion.div
            className="mt-3 rounded-2xl px-3 py-2 text-center text-sm font-extrabold"
            animate={{ backgroundColor: wholesale ? '#FFF8E1' : '#E8F5E9', color: wholesale ? '#8A5A00' : '#1B5E20' }}
          >
            {wholesale ? 'Wholesale prices' : 'Fresh today'}
          </motion.div>

          {loading ? (
            <div className="mt-3 grid grid-cols-2 gap-2.5" aria-label="Loading available products">
              {Array.from({ length: 4 }, (_, index) => (
                <div key={index} className="aspect-square animate-pulse rounded-2xl bg-line" />
              ))}
            </div>
          ) : error ? (
            <p className="mt-4 rounded-2xl bg-white p-4 text-center text-sm font-bold text-ink-mute">Shop availability is temporarily unavailable.</p>
          ) : products.length === 0 ? (
            <p className="mt-4 rounded-2xl bg-white p-4 text-center text-sm font-bold text-ink-mute">Fresh listings will appear here when farms add stock.</p>
          ) : (
            <div className="mt-3 grid grid-cols-2 gap-2.5">
              {products.map((it) => (
                <div key={it.id} className="overflow-hidden rounded-2xl bg-white shadow-soft">
                  <SmartImage src={it.image_url ?? undefined} alt={it.name} className="aspect-square w-full text-3xl" />
                  <div className="p-2.5">
                    <p className="truncate text-[13px] font-bold">{it.name}</p>
                    <div className="h-5 overflow-hidden">
                      <AnimatePresence mode="popLayout" initial={false}>
                        <motion.p
                          key={wholesale ? 'w' : 'r'}
                          initial={{ y: 14, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -14, opacity: 0 }}
                          className="text-[14px] font-extrabold text-leaf"
                        >
                          {formatTZS(wholesale ? it.wholesale_price : it.retail_price)}
                          <span className="text-[11px] font-medium text-ink-mute"> /{it.unit}</span>
                        </motion.p>
                      </AnimatePresence>
                    </div>
                    <AnimatePresence initial={false}>
                      {wholesale && (
                        <motion.p initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden text-[11px] font-bold text-sun-deep">
                          Min {it.wholesale_min_qty} {it.unit}
                        </motion.p>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function Hero() {
  const [wholesale, setWholesale] = useState(false);
  const { products, loading, error } = useStorefrontProducts(4);
  return (
    <section className="relative overflow-hidden">
      <div className="mx-auto grid max-w-7xl items-center gap-12 px-5 pb-20 pt-12 lg:grid-cols-[1.1fr_0.9fr] lg:pb-28 lg:pt-20">
        <div>
          <h1 className="font-display text-[2.9rem] font-extrabold leading-[0.96] tracking-tight text-ink sm:text-6xl lg:text-[5.2rem]">
            Farm-fresh food, at your door in hours.
          </h1>
          <p className="mt-6 max-w-xl text-xl leading-relaxed text-ink-soft">
            Order vegetables and fruit picked this morning on farms around Dodoma. Buy a little for your kitchen or a lot for your shop. It is the same app and honest prices.
          </p>

          <div className="mt-9">
            <p className="mb-3 text-lg font-bold">Try it. Slide to switch how you shop.</p>
            <ModeSlide wholesale={wholesale} onChange={setWholesale} />
            <p className="mt-3 h-6 text-ink-soft">
              {wholesale ? 'Wholesale shows bulk prices and the smallest amount you can order.' : 'Retail is for home cooks. Buy as little as one kilo.'}
            </p>
          </div>

          <div className="mt-8 flex flex-wrap gap-3">
            <LinkButton href="#download" variant="sun" size="lg">Get the app</LinkButton>
            <LinkButton href="#farmers" variant="soft" size="lg" icon={<Sprout size={22} />}>Sell your harvest</LinkButton>
          </div>
        </div>

        <div className="relative">
          <div className="absolute inset-x-0 top-6 mx-auto h-[540px] w-[88%] rounded-[3rem] bg-leaf field-lines" aria-hidden />
          <motion.div initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ type: 'spring', damping: 18, stiffness: 90, delay: 0.15 }} className="relative">
            <Phone wholesale={wholesale} products={products} loading={loading} error={error} />
          </motion.div>

          <div className="absolute -left-2 top-24 hidden animate-floaty items-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-bold shadow-lift sm:flex">
            <span className="grid h-8 w-8 place-items-center rounded-full bg-leaf-soft text-leaf"><Sprout size={18} /></span>
            Harvested 12 hours ago
          </div>
          <div className="absolute -right-2 bottom-24 hidden items-center gap-2 rounded-2xl bg-sun px-4 py-3 text-sm font-extrabold text-ink shadow-lift sm:flex">
            <Bike size={20} /> Free delivery within 5 km
          </div>
        </div>
      </div>
    </section>
  );
}
