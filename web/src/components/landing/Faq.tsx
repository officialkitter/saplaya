'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/format';

const QA = [
  { q: 'How fast is delivery?', a: 'Available delivery timeframes depend on the farms serving your location. The selected delivery option and any fees are shown before checkout.' },
  { q: 'How are farms and delivery fees selected?', a: 'Nearby farms with available stock are prioritized first. If nearby stock is limited, the search widens to farther suppliers. Distance-based delivery charges are confirmed before you place an order.' },
  { q: 'Can I see prices in my currency?', a: 'Prices can be displayed as an estimate in your selected currency using the latest available reference rate. The checkout total is confirmed before you place your order.' },
  { q: 'What does wholesale mode do?', a: 'It applies each product’s wholesale price and minimum quantity. Larger quantities may qualify for additional volume prices.' },
  { q: 'Can the farm see my details?', a: 'The farm sees your first name and your delivery area so it can pack your order. It never sees your phone number.' },
  { q: 'How do I pay?', a: 'Available payment methods and the order total are shown during checkout.' },
  { q: 'How does a farm join?', a: 'Fill in the form in the farmers section. We call you within 2 working days, and after approval you get an email with your sign-in link.' },
];

export function Faq() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section id="faq" className="py-20 lg:py-28">
      <div className="mx-auto grid max-w-7xl gap-10 px-5 lg:grid-cols-[0.8fr_1.2fr]">
        <h2 className="font-display text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">Questions people ask us.</h2>
        <div className="divide-y divide-line rounded-[2rem] bg-white px-6 shadow-soft">
          {QA.map((item, i) => {
            const isOpen = open === i;
            return (
              <div key={item.q}>
                <button
                  className="flex w-full items-center justify-between gap-4 py-5 text-left text-lg font-bold"
                  aria-expanded={isOpen}
                  onClick={() => setOpen(isOpen ? null : i)}
                >
                  {item.q}
                  <motion.span animate={{ rotate: isOpen ? 45 : 0 }} className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-full', isOpen ? 'bg-leaf text-white' : 'bg-leaf-soft text-leaf')}>
                    <Plus size={20} />
                  </motion.span>
                </button>
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                      <p className="pb-5 pr-12 text-lg text-ink-soft">{item.a}</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
