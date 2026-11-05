import { Check } from 'lucide-react';
import { BasketGraphic, CratesGraphic } from '@/components/ui/Graphics';

const HOME = ['Enter the quantity you need', 'Fresh produce, grains and cooking essentials', 'See nearby stock and delivery charges before checkout'];
const BULK = ['Wholesale, bulk and mega-bulk volume tiers', 'Tier availability and prices are set per product', 'Larger orders can be matched to farther stocked farms'];

export function TwoWays() {
  return (
    <section className="bg-white py-20 lg:py-28">
      <div className="mx-auto max-w-7xl px-5">
        <h2 className="max-w-2xl font-display text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">
          Buy a little, or buy a lot.
        </h2>
        <div className="mt-12 grid gap-5 lg:grid-cols-2">
          <div className="relative overflow-hidden rounded-[2rem] bg-leaf-soft p-8 sm:p-10">
            <BasketGraphic className="absolute -right-6 -top-4 h-56 w-56 opacity-90" />
            <h3 className="font-display text-3xl font-extrabold text-leaf-deep">Cooking at home</h3>
            <p className="mt-2 max-w-xs text-ink-soft">Retail mode. One basket, one kitchen.</p>
            <ul className="mt-24 space-y-3 sm:mt-28">
              {HOME.map((t) => (
                <li key={t} className="flex items-start gap-3 text-lg font-semibold">
                  <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-leaf text-white"><Check size={15} strokeWidth={3} /></span>
                  {t}
                </li>
              ))}
            </ul>
          </div>
          <div className="relative overflow-hidden rounded-[2rem] bg-sun-soft p-8 sm:p-10">
            <CratesGraphic className="absolute -right-6 -top-4 h-56 w-56" />
            <h3 className="font-display text-3xl font-extrabold text-[#6B4A12]">Running a shop or kitchen</h3>
            <p className="mt-2 max-w-xs text-ink-soft">Wholesale mode. Stacked crates, better prices.</p>
            <ul className="mt-24 space-y-3 sm:mt-28">
              {BULK.map((t) => (
                <li key={t} className="flex items-start gap-3 text-lg font-semibold">
                  <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-sun-deep text-ink"><Check size={15} strokeWidth={3} /></span>
                  {t}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
