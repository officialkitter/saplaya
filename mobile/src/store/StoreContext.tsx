import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { CartLine, Mode, Product } from '../types';
import { volumePrice, volumeTier } from '../lib/volume';

type Ctx = {
  mode: Mode;
  setMode: (m: Mode) => void;
  lines: CartLine[];
  add: (p: Product, qty: number) => void;
  setQty: (id: string, qty: number) => void;
  clear: () => void;
  count: number;
  priceOf: (p: Product, qty?: number) => number | null;
  tierOf: (p: Product, qty: number) => ReturnType<typeof volumeTier>;
  subtotal: number;
  lastOrderId: string | null;
  setLastOrderId: (id: string | null) => void;
};

const StoreCtx = createContext<Ctx>(null as unknown as Ctx);
export const useStore = () => useContext(StoreCtx);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<Mode>('retail');
  const [lines, setLines] = useState<CartLine[]>([]);
  const [lastOrderId, setLastOrderId] = useState<string | null>(null);

  const priceOf = useCallback((p: Product, qty = 1) => volumePrice(p, qty, mode), [mode]);
  const tierOf = useCallback((p: Product, qty: number) => volumeTier(p, qty, mode), [mode]);

  const add = useCallback((product: Product, qty: number) => {
    setLines((prev) => {
      const found = prev.find((l) => l.product.id === product.id);
      if (found) return prev.map((l) => (l.product.id === product.id ? { ...l, qty: l.qty + qty } : l));
      return [...prev, { product, qty }];
    });
  }, []);

  const setQty = useCallback((id: string, qty: number) => {
    setLines((prev) => (qty <= 0 ? prev.filter((l) => l.product.id !== id) : prev.map((l) => (l.product.id === id ? { ...l, qty } : l))));
  }, []);

  const clear = useCallback(() => setLines([]), []);

  const value = useMemo<Ctx>(
    () => ({
      mode,
      setMode,
      lines,
      add,
      setQty,
      clear,
      priceOf,
      lastOrderId,
      setLastOrderId,
      count: lines.reduce((n, l) => n + l.qty, 0),
      tierOf,
      subtotal: lines.reduce((n, l) => n + (priceOf(l.product, l.qty) ?? 0) * l.qty, 0),
    }),
    [mode, lines, add, setQty, clear, priceOf, tierOf, lastOrderId]
  );

  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>;
}
