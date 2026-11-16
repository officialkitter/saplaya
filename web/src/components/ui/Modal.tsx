'use client';

import { AnimatePresence, motion, useIsPresent } from 'framer-motion';
import { X } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';
import { cn } from '@/lib/format';

/**
 * Full-screen overlay container. While its exit animation runs (or if it ever stalls),
 * it stops catching taps so the page underneath stays usable.
 */
export function OverlayRoot({ className, children }: { className?: string; children: ReactNode }) {
  const isPresent = useIsPresent();
  return (
    <div className={cn('fixed inset-0 z-50 overscroll-contain', !isPresent && 'pointer-events-none', className)} aria-hidden={isPresent ? undefined : true}>
      {children}
    </div>
  );
}

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
        <OverlayRoot key="modal" className="grid place-items-center p-3 sm:p-4">
          <motion.div
            className="absolute inset-0 bg-ink/45"
            onClick={onClose}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          />
          <motion.div
            role="dialog" aria-modal="true" aria-label={title}
            className={cn('relative max-h-[calc(100dvh-1.5rem)] w-full min-w-0 overflow-y-auto overscroll-contain rounded-3xl bg-white p-5 shadow-lift sm:max-h-[90vh] sm:p-6', wide ? 'max-w-2xl' : 'max-w-lg')}
            initial={{ y: 28, scale: 0.96, opacity: 0 }} animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ y: 16, scale: 0.97, opacity: 0 }}
            transition={{ type: 'spring', damping: 26, stiffness: 320 }}
          >
            <div className="mb-5 flex items-start justify-between gap-4">
              <h2 className="min-w-0 break-words font-display text-xl font-extrabold sm:text-2xl">{title}</h2>
              <button type="button" onClick={onClose} aria-label="Close" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-ink-soft hover:bg-leaf-soft">
                <X size={22} />
              </button>
            </div>
            {children}
          </motion.div>
        </OverlayRoot>
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
        <OverlayRoot key="drawer">
          <motion.div
            className="absolute inset-0 bg-ink/40"
            onClick={onClose}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          />
          <motion.aside
            role="dialog" aria-modal="true" aria-label={title}
            className="absolute right-0 top-0 flex h-full w-full max-w-xl flex-col bg-milk shadow-lift"
            initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 32, stiffness: 320 }}
          >
            <div className="flex items-center justify-between gap-3 border-b border-line bg-white px-4 py-4 sm:px-6">
              <h2 className="min-w-0 truncate font-display text-xl font-extrabold">{title}</h2>
              <button type="button" onClick={onClose} aria-label="Close" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-ink-soft hover:bg-leaf-soft">
                <X size={22} />
              </button>
            </div>
            <div className="min-w-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6">{children}</div>
          </motion.aside>
        </OverlayRoot>
      )}
    </AnimatePresence>
  );
}
