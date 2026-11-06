import { Mode, Product } from '../types';

export type VolumeTier = 'retail' | 'wholesale' | 'bulk' | 'mega_bulk';
export type BaseMode = 'retail' | 'wholesale';

export function volumeTier(product: Product, qty: number, mode: Mode): VolumeTier {
  const wholesaleMinimum = Math.max(1, product.wholesale_min_qty);
  if (qty >= wholesaleMinimum * 100) return 'mega_bulk';
  if (qty >= wholesaleMinimum * 10) return 'bulk';
  if (mode === 'wholesale' || qty >= wholesaleMinimum) return 'wholesale';
  return 'retail';
}

export function volumePrice(product: Product, qty: number, mode: Mode): number | null {
  const tier = volumeTier(product, qty, mode);
  if (tier === 'mega_bulk') {
    return typeof product.mega_bulk_price === 'number' && Number.isFinite(product.mega_bulk_price)
      ? product.mega_bulk_price
      : null;
  }
  if (tier === 'bulk') {
    return typeof product.bulk_price === 'number' && Number.isFinite(product.bulk_price)
      ? product.bulk_price
      : null;
  }
  if (tier === 'wholesale') return product.wholesale_price;
  return product.retail_price;
}

export function volumeTierLabel(tier: VolumeTier): string {
  if (tier === 'mega_bulk') return 'Mega-bulk';
  if (tier === 'bulk') return 'Bulk';
  if (tier === 'wholesale') return 'Wholesale';
  return 'Retail';
}

export function unlockedVolumeTier(product: Product, previousQty: number, nextQty: number, mode: Mode): 'bulk' | 'mega_bulk' | null {
  if (nextQty <= previousQty) return null;
  const previous = volumeTier(product, previousQty, mode);
  const next = volumeTier(product, nextQty, mode);
  if (previous === next || (next !== 'bulk' && next !== 'mega_bulk')) return null;
  return next;
}

export function orderMode(lines: { product: Product; qty: number }[], preferredMode: BaseMode): Mode {
  let mode: Mode = preferredMode;
  for (const { product, qty } of lines) {
    const tier = volumeTier(product, qty, preferredMode);
    if (tier === 'mega_bulk' || (tier === 'bulk' && mode !== 'mega_bulk')
      || (tier === 'wholesale' && mode === 'retail')) mode = tier;
  }
  return mode;
}
