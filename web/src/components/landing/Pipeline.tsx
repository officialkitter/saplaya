'use client';

import { motion } from 'framer-motion';
import { ClipboardList, DoorOpen, ShoppingBag, Truck } from 'lucide-react';

const STEPS = [
  { icon: ClipboardList, color: '#FFB300', title: 'Confirm your basket', text: 'The available stock, selected farm locations, item prices and delivery charges are checked before checkout.' },
  { icon: ShoppingBag, color: '#0288D1', title: 'The farm prepares it', text: 'Your selected farm receives the order details needed to prepare the items.' },
  { icon: Truck, color: '#7B1FA2', title: 'Choose delivery speed', text: 'Review the delivery timeframe and any extra charge before confirming your order.' },
  { icon: DoorOpen, color: '#2E7D32', title: 'Track your order', text: 'Follow order status updates from your customer account.' },
];

/** The same four stages, in the same colours, that customers see in the app. */
export function Pipeline() {
  return (
    <section id="how" className="bg-white py-20 lg:py-28">
      <div className="mx-auto max-w-7xl px-5">
        <h2 className="max-w-2xl font-display text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">
          From nearby farm stock to your delivery address.
        </h2>
        <p className="mt-4 max-w-xl text-lg text-ink-soft">
          Nearby farms are prioritized when they have enough stock. If needed, the search widens to farther suppliers and refreshes the distance-based quote.
        </p>

        <motion.ol
          initial="off"
          whileInView="on"
          viewport={{ once: true, margin: '-120px' }}
          className="mt-14 grid gap-10 md:grid-cols-4 md:gap-0"
        >
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const delay = i * 0.55;
            return (
              <li key={s.title} className="relative flex gap-5 md:block md:px-4 md:text-center">
                {i < STEPS.length - 1 && (
                  <motion.span
                    aria-hidden
                    variants={{ off: { scaleX: 0 }, on: { scaleX: 1, transition: { delay: delay + 0.3, duration: 0.5 } } }}
                    style={{ backgroundColor: STEPS[i + 1].color, transformOrigin: 'left' }}
                    className="absolute left-[calc(50%+44px)] right-[calc(-50%+44px)] top-[38px] hidden h-1.5 rounded-full md:block"
                  />
                )}
                <motion.span
                  variants={{
                    off: { backgroundColor: '#FFFFFF', borderColor: '#E3EBE0', color: '#6B7A6C', boxShadow: '0 0 0 0 rgba(0,0,0,0)' },
                    on: { backgroundColor: s.color, borderColor: s.color, color: '#FFFFFF', boxShadow: `0 0 34px 6px ${s.color}66`, transition: { delay, duration: 0.5 } },
                  }}
                  className="relative z-10 grid h-[78px] w-[78px] shrink-0 place-items-center rounded-full border-[3px] md:mx-auto"
                >
                  <Icon size={34} />
                </motion.span>
                <div className="md:mt-5">
                  <h3 className="font-display text-xl font-extrabold">{s.title}</h3>
                  <p className="mt-1.5 text-ink-soft">{s.text}</p>
                </div>
              </li>
            );
          })}
        </motion.ol>
      </div>
    </section>
  );
}
