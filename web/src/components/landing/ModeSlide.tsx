'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/format';

export function ModeSlide({ wholesale, onChange }: { wholesale: boolean; onChange: (wholesale: boolean) => void }) {
  return (
    <div role="group" aria-label="Shopping mode" className="relative flex h-[68px] w-full max-w-md rounded-full border-2 border-line bg-white p-1.5 shadow-soft">
      <motion.span
        aria-hidden
        className="absolute bottom-1.5 left-1.5 top-1.5 w-[calc(50%-6px)] rounded-full"
        animate={{ x: wholesale ? '100%' : '0%', backgroundColor: wholesale ? '#FFD54F' : '#2E7D32' }}
        transition={{ type: 'spring', damping: 15, stiffness: 190 }}
      />
      {([false, true] as const).map((value) => (
        <button
          key={String(value)}
          type="button"
          aria-pressed={wholesale === value}
          onClick={() => onChange(value)}
          className={cn('relative z-10 flex-1 rounded-full text-base font-extrabold transition-colors sm:text-lg', wholesale === value ? (value ? 'text-ink' : 'text-white') : 'text-ink-mute')}
        >
          {value ? 'Wholesale' : 'Retail'}
        </button>
      ))}
    </div>
  );
}
