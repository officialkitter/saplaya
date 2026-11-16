'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';
import { cn } from '@/lib/format';

function useEscape(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);
}

export function Modal({
  open, onClose, title, children, wide,
}: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  useEscape(open, onClose);
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center p-4">
          <motion.div
            className="absolute inset-0 bg-ink/45 backdrop-blur-sm"
            onClick={onClose}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          />
          <motion.div
            role="dialog" aria-modal="true" aria-label={title}
            className={cn('relative max-h-[90vh] w-full overflow-y-auto rounded-3xl bg-white p-6 shadow-lift', wide ? 'max-w-2xl' : 'max-w-lg')}
            initial={{ y: 28, scale: 0.96, opacity: 0 }} animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ y: 16, scale: 0.97, opacity: 0 }}
            transition={{ type: 'spring', damping: 26, stiffness: 320 }}
          >
            <div className="mb-5 flex items-start justify-between gap-4">
              <h2 className="font-display text-2xl font-extrabold">{title}</h2>
              <button onClick={onClose} aria-label="Close" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-ink-soft hover:bg-leaf-soft">
                <X size={22} />
              </button>
            </div>
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

export function Drawer({
  open, onClose, title, children,
}: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  useEscape(open, onClose);
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50">
          <motion.div
            className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]"
            onClick={onClose}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          />
          <motion.aside
            role="dialog" aria-modal="true" aria-label={title}
            className="absolute right-0 top-0 flex h-full w-full max-w-xl flex-col bg-milk shadow-lift"
            initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 32, stiffness: 320 }}
          >
            <div className="flex items-center justify-between border-b border-line bg-white px-6 py-4">
              <h2 className="font-display text-xl font-extrabold">{title}</h2>
              <button onClick={onClose} aria-label="Close" className="grid h-10 w-10 place-items-center rounded-xl text-ink-soft hover:bg-leaf-soft">
                <X size={22} />
              </button>
            </div>
            <div className="min-w-0 flex-1 overflow-y-auto p-4 sm:p-6">{children}</div>
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  );
}
