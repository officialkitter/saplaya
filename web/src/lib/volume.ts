import type { Mode } from './types';
import type { StorefrontProduct } from './storefront';

export type VolumeTier = 'retail' | 'wholesale' | 'bulk' | 'mega_bulk';

export function volumeTheme(mode: VolumeTier) {
  if (mode === 'mega_bulk') return { accent: '#5D4037', soft: '#EFEBE9', background: '#FAF7F5', label: 'Mega-bulk', button: '#5D4037', buttonText: '#FFFFFF' };
  if (mode === 'bulk') return { accent: '#006D75', soft: '#E0F4F4', background: '#F3FAFA', label: 'Bulk', button: '#006D75', buttonText: '#FFFFFF' };
  if (mode === 'wholesale') return { accent: '#705000', soft: '#FFE47A', background: '#FFF4C2', label: 'Wholesale', button: '#FFD54F', buttonText: '#15261A' };
  return { accent: '#2E7D32', soft: '#E8F5E9', background: '#F9FBF7', label: 'Retail', button: '#2E7D32', buttonText: '#FFFFFF' };
}

export function volumeTier(product: StorefrontProduct, qty: number, preferredMode: 'retail' | 'wholesale'): VolumeTier {
  const minimum = Math.max(1, product.wholesale_min_qty);
  if (qty >= minimum * 100) return 'mega_bulk';
  if (qty >= minimum * 10) return 'bulk';
  if (preferredMode === 'wholesale' || qty >= minimum) return 'wholesale';
  return 'retail';
}

export function volumePrice(product: StorefrontProduct, qty: number, preferredMode: 'retail' | 'wholesale') {
  switch (volumeTier(product, qty, preferredMode)) {
    case 'mega_bulk': return product.mega_bulk_price;
    case 'bulk': return product.bulk_price;
    case 'wholesale': return product.wholesale_price;
    default: return product.retail_price;
  }
}

export function orderMode(lines: { product: StorefrontProduct; qty: number }[], preferredMode: 'retail' | 'wholesale'): Mode {
  let mode: Mode = preferredMode;
  for (const { product, qty } of lines) {
    const tier = volumeTier(product, qty, preferredMode);
    if (tier === 'mega_bulk' || (tier === 'bulk' && mode !== 'mega_bulk')
      || (tier === 'wholesale' && mode === 'retail')) mode = tier;
  }
  return mode;
}

export function tierPrices(retailPrice: number, percentages: { wholesale: number; bulk: number; mega_bulk: number }) {
  if (!Number.isSafeInteger(retailPrice) || retailPrice < 2) {
    return { wholesale: 0, bulk: 0, mega_bulk: 0 };
  }
  const wholesale = Math.min(retailPrice - 1, Math.max(1, Math.round(retailPrice * percentages.wholesale / 100)));
  const bulk = Math.min(wholesale, Math.max(1, Math.round(retailPrice * percentages.bulk / 100)));
  return {
    wholesale,
    bulk,
    mega_bulk: Math.min(bulk, Math.max(1, Math.round(retailPrice * percentages.mega_bulk / 100))),
  };
}
