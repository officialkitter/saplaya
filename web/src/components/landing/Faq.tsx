'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/format';
import { FAQ_ITEMS } from '@/lib/faq-content';

export function Faq() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section id="faq" className="py-20 lg:py-28">
      <div className="mx-auto grid max-w-7xl gap-10 px-5 lg:grid-cols-[0.8fr_1.2fr]">
        <h2 className="font-display text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">Questions people ask us.</h2>
        <div className="divide-y divide-line rounded-[2rem] bg-white px-6 shadow-soft">
          {FAQ_ITEMS.map((item, i) => {
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
