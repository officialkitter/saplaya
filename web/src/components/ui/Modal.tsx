'use client';

import { AnimatePresence, motion, useIsPresent } from 'framer-motion';
import { X } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import { cn } from '@/lib/format';

/**
 * Full-screen overlay container. While its exit animation runs (or if it ever stalls),
 * it stops catching taps so the page underneath stays usable.
 */
export function OverlayRoot({ className, children }: { className?: string; children: ReactNode }) {
  const isPresent = useIsPresent();
  const rootRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<Element | null>(null);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const restoreFocus = () => {
      const previousFocus = previousFocusRef.current;
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected && !previousFocus.closest('[inert]')) {
        previousFocus.focus({ preventScroll: true });
      }
      if (root.contains(document.activeElement) && document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
    };
    if (!isPresent) {
      restoreFocus();
      root.setAttribute('inert', '');
      return;
    }
    root.removeAttribute('inert');
    if (!root.contains(document.activeElement)) previousFocusRef.current = document.activeElement;
    const dialog = root.querySelector<HTMLElement>('[role="dialog"]');
    const focusable = () => Array.from(root.querySelectorAll<HTMLElement>(
      'button, a[href], input, select, textarea, [tabindex]',
    )).filter((element) => element.tabIndex >= 0
      && !element.matches(':disabled')
      && !element.closest('[inert]')
      && element.getClientRects().length > 0);
    const isTopmost = () => {
      const overlays = document.querySelectorAll('[data-overlay-root]:not([inert])');
      return overlays[overlays.length - 1] === root;
    };
    const focusInside = () => (focusable()[0] ?? dialog)?.focus({ preventScroll: true });
    const onFocus = (event: FocusEvent) => {
      if (isTopmost() && event.target instanceof Node && !root.contains(event.target)) focusInside();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || !isTopmost()) return;
      const elements = focusable();
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (!first || (event.shiftKey
        ? document.activeElement === first || document.activeElement === dialog
        : document.activeElement === last || document.activeElement === dialog)) {
        event.preventDefault();
        (event.shiftKey ? last ?? dialog : first ?? dialog)?.focus({ preventScroll: true });
      }
    };
    focusInside();
    document.addEventListener('focusin', onFocus);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('focusin', onFocus);
      document.removeEventListener('keydown', onKey);
      // React restores the pre-commit selection after layout-effect cleanup.
      queueMicrotask(() => {
        if (!root.isConnected && document.activeElement === document.body) restoreFocus();
      });
    };
  }, [isPresent]);

  return (
    <div ref={rootRef} data-overlay-root="" className={cn('fixed inset-0 z-50 overscroll-contain', !isPresent && 'pointer-events-none', className)}>
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
            role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}
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
            role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}
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
