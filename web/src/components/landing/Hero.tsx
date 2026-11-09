'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { Sprout, Truck } from 'lucide-react';
import { LinkButton } from '@/components/ui/Button';
import { BasketGraphic, CratesGraphic } from '@/components/ui/Graphics';
import { SmartImage } from '@/components/ui/SmartImage';
import { cn } from '@/lib/format';
import { useStorefrontProducts, type StorefrontProduct } from '@/lib/storefront';
import { useGlobalMarket } from '@/lib/global-market';
import { useStorefrontCart } from '@/lib/cart';
import { volumeTheme } from '@/lib/volume';

/** The big slide toggle: same control the customer app uses. */
function ModeSlide({ wholesale, onChange }: { wholesale: boolean; onChange: (w: boolean) => void }) {
  return (
    <div role="group" aria-label="Shopping mode" className="relative flex h-[68px] w-full max-w-md rounded-full border-2 border-line bg-white p-1.5 shadow-soft">
      <motion.span
        aria-hidden
        className="absolute bottom-1.5 left-1.5 top-1.5 w-[calc(50%-6px)] rounded-full"
        animate={{ x: wholesale ? '100%' : '0%', backgroundColor: wholesale ? '#FFD54F' : '#2E7D32' }}
        transition={{ type: 'spring', damping: 15, stiffness: 190 }}
      />
      {([false, true] as const).map((w) => (
        <button
          key={String(w)}
          aria-pressed={wholesale === w}
          onClick={() => onChange(w)}
          className={cn('relative z-10 flex-1 rounded-full text-base font-extrabold transition-colors sm:text-lg', wholesale === w ? (w ? 'text-ink' : 'text-white') : 'text-ink-mute')}
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
  formatPrice,
}: {
  wholesale: boolean;
  products: StorefrontProduct[];
  loading: boolean;
  error: boolean;
  formatPrice: (amountTzs: number) => string;
}) {
  return (
    <div className="relative mx-auto h-[600px] w-[300px] max-w-full rounded-[2.8rem] border-[10px] border-ink bg-milk shadow-lift">
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
              <p className="text-[11px] text-ink-mute">Location-aware farm search</p>
              <p className="text-[15px] font-extrabold">Nearest stocked farms first</p>
            </div>
          </div>

          <motion.div
            className="mt-3 rounded-2xl px-3 py-2 text-center text-sm font-extrabold"
            animate={{ backgroundColor: wholesale ? '#FFF8E1' : '#E8F5E9', color: wholesale ? '#805400' : '#1B5E20' }}
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
                    <p className="line-clamp-2 min-h-[2.4em] break-words text-[13px] font-bold leading-[1.2]" title={it.name}>{it.name}</p>
                    <div className="min-h-5">
                      <AnimatePresence mode="popLayout" initial={false}>
                        <motion.p
                          key={wholesale ? 'w' : 'r'}
                          initial={{ y: 14, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -14, opacity: 0 }}
                          className="break-words text-[13px] font-extrabold text-leaf"
                        >
                          {formatPrice(wholesale ? it.wholesale_price : it.retail_price)}
                          <span className="text-[11px] font-medium text-ink-mute"> /{it.unit}</span>
                        </motion.p>
                      </AnimatePresence>
                    </div>
                    {typeof it.farm_distance_km === 'number' && (
                      <p className="text-[10px] font-semibold text-ink-mute">{it.farm_distance_km.toFixed(1)} km away</p>
                    )}
                    <AnimatePresence initial={false}>
                      {wholesale && (
                        <motion.p initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden text-[11px] font-bold text-[#805400]">
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
  const { preferredMode, setPreferredMode, mode } = useStorefrontCart();
  const wholesale = preferredMode === 'wholesale';
  const theme = volumeTheme(mode);
  const market = useGlobalMarket();
  const { products, loading, error } = useStorefrontProducts(4, market.location);
  return (
    <section className="relative overflow-hidden">
      <div className="mx-auto grid max-w-7xl items-center gap-12 px-5 pb-20 pt-12 lg:grid-cols-[1.1fr_0.9fr] lg:pb-28 lg:pt-20">
        <div>
          <h1 className="font-display text-[2.9rem] font-extrabold leading-[0.96] tracking-tight text-ink sm:text-6xl lg:text-[5.2rem]">
            Farm-fresh food, at your door in hours.
          </h1>
          <p className="mt-6 max-w-xl text-xl leading-relaxed text-ink-soft">
            {market.location
              ? `Showing stocked farms near ${market.placeName ?? 'your current location'}. Buy a little for your kitchen or a lot for your shop.`
              : 'Allow location access to prioritize nearby stocked farms, or browse without it. Buy a little for your kitchen or a lot for your shop.'}
          </p>

          <div className="mt-9">
            <p className="mb-3 text-lg font-bold">Try it. Slide to switch how you shop.</p>
            <ModeSlide wholesale={wholesale} onChange={(value) => setPreferredMode(value ? 'wholesale' : 'retail')} />
            {mode !== preferredMode && <p className="mt-2 text-sm font-bold" style={{ color: theme.accent }}>{theme.label} unlocked by basket quantity</p>}
            <p className="mt-3 min-h-6 text-ink-soft">
              {wholesale ? 'See wholesale prices and minimum quantities.' : 'Shop individual items at retail prices.'}
            </p>
          </div>

          <div className="mt-8 flex flex-wrap gap-3">
            <LinkButton href="#download" variant="sun" size="lg">Get the app</LinkButton>
            <LinkButton href="#farmers" variant="soft" size="lg" icon={<Sprout size={22} />}>Sell your harvest</LinkButton>
          </div>
        </div>

        <div className="relative">
          <div className="absolute inset-x-0 top-6 mx-auto h-[540px] w-[88%] rounded-[3rem] field-lines" style={{ backgroundColor: theme.button }} aria-hidden />
          <motion.div initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ type: 'spring', damping: 18, stiffness: 90, delay: 0.15 }} className="relative">
            <Phone wholesale={wholesale} products={products} loading={loading} error={error} formatPrice={market.formatPrice} />
          </motion.div>

        </div>
      </div>
    </section>
  );
}
