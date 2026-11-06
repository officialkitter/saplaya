'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { isStorefrontProduct, type StorefrontProduct } from './storefront';

export type StorefrontCartLine = { product: StorefrontProduct; qty: number };

type StorefrontCartValue = {
  lines: StorefrontCartLine[];
  count: number;
  add: (product: StorefrontProduct) => void;
  setQuantity: (productId: string, qty: number) => void;
  clear: () => void;
};

const STORAGE_KEY = 'saplaya.storefront.cart.v1';
const StorefrontCartContext = createContext<StorefrontCartValue | null>(null);

function isCartLine(value: unknown): value is StorefrontCartLine {
  if (typeof value !== 'object' || value === null) return false;
  const line = value as Record<string, unknown>;
  return typeof line.qty === 'number' && Number.isInteger(line.qty) && line.qty > 0 && line.qty <= 10000
    && isStorefrontProduct(line.product);
}

export function StorefrontCartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<StorefrontCartLine[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed: unknown = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.every(isCartLine)) setLines(parsed);
      }
    } catch (error) {
      console.error('Could not restore the web basket:', error);
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
    } catch (error) {
      console.error('Could not save the web basket:', error);
    }
  }, [lines, ready]);

  const add = useCallback((product: StorefrontProduct) => {
    setLines((current) => {
      const existing = current.find((line) => line.product.id === product.id);
      if (!existing) return [...current, { product, qty: 1 }];
      return current.map((line) => line.product.id === product.id
        ? { ...line, product, qty: Math.min(product.stock, 10000, line.qty + 1) }
        : line);
    });
  }, []);

  const setQuantity = useCallback((productId: string, qty: number) => {
    setLines((current) => qty <= 0
      ? current.filter((line) => line.product.id !== productId)
      : current.map((line) => line.product.id === productId
        ? { ...line, qty: Math.min(line.product.stock, 10000, Math.max(1, Math.floor(qty))) }
        : line));
  }, []);

  const clear = useCallback(() => setLines([]), []);
  const value = useMemo(() => ({
    lines,
    count: lines.reduce((total, line) => total + line.qty, 0),
    add,
    setQuantity,
    clear,
  }), [lines, add, setQuantity, clear]);

  return <StorefrontCartContext.Provider value={value}>{children}</StorefrontCartContext.Provider>;
}

export function useStorefrontCart() {
  const context = useContext(StorefrontCartContext);
  if (!context) throw new Error('useStorefrontCart must be used within StorefrontCartProvider.');
  return context;
}
