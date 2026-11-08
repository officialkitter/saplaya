import { Check } from 'lucide-react';
import { BasketGraphic, CratesGraphic } from '@/components/ui/Graphics';

const HOME = ['Choose the quantity you need', 'Fresh produce and pantry essentials', 'See stock and delivery charges before checkout'];
const BULK = ['Wholesale, bulk and mega-bulk prices', 'Minimum quantities vary by product', 'More farms are considered for larger orders'];

export function TwoWays() {
  return (
    <section className="bg-white py-20 lg:py-28">
      <div className="mx-auto max-w-7xl px-5">
        <h2 className="max-w-2xl font-display text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">
          Buy a little, or buy a lot.
        </h2>
        <div className="mt-12 grid gap-5 lg:grid-cols-2">
          <div className="relative overflow-hidden rounded-[2rem] bg-leaf-soft p-6 sm:p-10">
            <BasketGraphic className="absolute -right-6 -top-4 h-40 w-40 opacity-50 sm:h-56 sm:w-56 sm:opacity-90" />
            <h3 className="relative max-w-[70%] font-display text-2xl font-extrabold leading-tight text-leaf-deep sm:text-3xl">Cooking at home</h3>
            <p className="relative mt-2 max-w-xs text-ink-soft">Retail prices for everyday shopping.</p>
            <ul className="relative mt-28 space-y-3 sm:mt-32">
              {HOME.map((t) => (
                <li key={t} className="flex min-w-0 items-start gap-3 break-words text-base font-semibold leading-relaxed sm:text-lg">
                  <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-leaf text-white"><Check size={15} strokeWidth={3} /></span>
                  {t}
                </li>
              ))}
            </ul>
          </div>
          <div className="relative overflow-hidden rounded-[2rem] bg-sun-soft p-6 sm:p-10">
            <CratesGraphic className="absolute -right-6 -top-4 h-40 w-40 opacity-50 sm:h-56 sm:w-56 sm:opacity-90" />
            <h3 className="relative max-w-[70%] font-display text-2xl font-extrabold leading-tight text-ink sm:text-3xl">For shops and kitchens</h3>
            <p className="relative mt-2 max-w-xs text-ink-soft">Volume prices for larger orders.</p>
            <ul className="relative mt-28 space-y-3 sm:mt-32">
              {BULK.map((t) => (
                <li key={t} className="flex min-w-0 items-start gap-3 break-words text-base font-semibold leading-relaxed sm:text-lg">
                  <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-sun text-ink"><Check size={15} strokeWidth={3} /></span>
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
