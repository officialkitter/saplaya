'use client';

import { animate, motion } from 'framer-motion';
import { Check, Info, TriangleAlert } from 'lucide-react';
import { AnimatePresence } from 'framer-motion';
import { useEffect, useState, type ReactNode } from 'react';
import { cn, STATUS } from '@/lib/format';
import { useToast } from '@/lib/store';
import type { OrderStatus } from '@/lib/types';

export function StatusPill({ status, className }: { status: OrderStatus; className?: string }) {
  const m = STATUS[status];
  return (
    <span
      className={cn('inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-bold', className)}
      style={{ backgroundColor: m.soft, color: status === 'pending' ? '#8A5A00' : m.color }}
    >
      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: m.color }} />
      {m.label}
    </span>
  );
}

export function CountUp({ value, prefix = '', className, format }: { value: number; prefix?: string; className?: string; format?: (value: number) => string }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    const c = animate(0, value, { duration: 1.1, ease: 'easeOut', onUpdate: (x) => setV(x) });
    return () => c.stop();
  }, [value]);
  return (
    <span className={className}>
      {format ? format(v) : <>{prefix}{Math.round(v).toLocaleString('en-US')}</>}
    </span>
  );
}

export function EmptyState({
  icon, title, hint, action,
}: { icon: ReactNode; title: string; hint: string; action?: ReactNode }) {
  return (
    <div className="grid place-items-center rounded-3xl border-2 border-dashed border-line bg-white/60 px-6 py-14 text-center">
      <motion.div
        initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', damping: 12 }}
        className="grid h-20 w-20 place-items-center rounded-full bg-leaf-soft text-leaf"
      >
        {icon}
      </motion.div>
      <p className="mt-4 font-display text-xl font-extrabold">{title}</p>
      <p className="mt-1 max-w-sm text-ink-mute">{hint}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Toaster() {
  const toasts = useToast((s) => s.toasts);
  const dismiss = useToast((s) => s.dismiss);
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.button
            key={t.id}
            layout
            onClick={() => dismiss(t.id)}
            initial={{ y: 30, opacity: 0, scale: 0.95 }} animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 10, opacity: 0, scale: 0.95 }}
            transition={{ type: 'spring', damping: 22, stiffness: 320 }}
            className={cn(
              'pointer-events-auto flex max-w-md items-center gap-3 rounded-2xl px-4 py-3 text-left text-[15px] font-semibold text-white shadow-lift',
              t.tone === 'good' && 'bg-leaf',
              t.tone === 'bad' && 'bg-[#C62828]',
              t.tone === 'info' && 'bg-ink'
            )}
          >
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white/20">
              {t.tone === 'good' ? <Check size={16} /> : t.tone === 'bad' ? <TriangleAlert size={16} /> : <Info size={16} />}
            </span>
            {t.text}
          </motion.button>
        ))}
      </AnimatePresence>
    </div>
  );
}
