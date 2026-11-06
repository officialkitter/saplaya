export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const r = (d: number) => (d * Math.PI) / 180;
  const a =
    Math.sin(r(lat2 - lat1) / 2) ** 2 +
    Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(r(lng2 - lng1) / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export type OrderMode = 'retail' | 'wholesale' | 'bulk' | 'mega_bulk';

export type PricingPercentages = {
  wholesale: number;
  bulk: number;
  mega_bulk: number;
};

export function calculateTierPrices(retailPrice: number, percentages: PricingPercentages) {
  if (!Number.isSafeInteger(retailPrice) || retailPrice < 2) {
    throw new Error('Retail price must be a whole TZS amount of at least 2.');
  }
  const wholesale = Math.min(retailPrice - 1, Math.max(1, Math.round(retailPrice * percentages.wholesale / 100)));
  const bulk = Math.min(wholesale, Math.max(1, Math.round(retailPrice * percentages.bulk / 100)));
  const megaBulk = Math.min(bulk, Math.max(1, Math.round(retailPrice * percentages.mega_bulk / 100)));
  return { wholesale, bulk, mega_bulk: megaBulk };
}

export function volumeTierForQuantity(
  quantity: number,
  wholesaleMinimum: number,
  preferredMode: OrderMode,
): OrderMode {
  if (quantity >= wholesaleMinimum * 100) return 'mega_bulk';
  if (quantity >= wholesaleMinimum * 10) return 'bulk';
  if (preferredMode === 'wholesale' || quantity >= wholesaleMinimum) return 'wholesale';
  return 'retail';
}

export function deriveOrderMode<T extends { qty: number; product: { wholesale_min_qty: number } }>(
  lines: T[],
  preferredMode: 'retail' | 'wholesale',
): OrderMode {
  let mode: OrderMode = preferredMode;
  for (const line of lines) {
    const tier = volumeTierForQuantity(line.qty, line.product.wholesale_min_qty, preferredMode);
    if (tier === 'mega_bulk' || (tier === 'bulk' && mode !== 'mega_bulk')
      || (tier === 'wholesale' && mode === 'retail')) {
      mode = tier;
    }
  }
  return mode;
}

type StorefrontSupplier = {
  id: string;
  status: string;
  latitude: number | null;
  longitude: number | null;
};

type StorefrontListing = {
  id: string;
  name: string;
  stock: number;
  supplier_id: string;
  catalog_product_id: string | null;
};

export function selectStorefrontProducts<T extends StorefrontListing>(
  products: T[],
  suppliers: StorefrontSupplier[],
  approvedCatalogIds: Set<string>,
  location: { lat: number; lng: number } | null,
): { product: T; distance: number | null }[] {
  const supplierById = new Map(suppliers.map((supplier) => [supplier.id, supplier]));
  const uniqueProducts = new Map<string, { product: T; distance: number | null }>();
  for (const product of products) {
    const supplier = supplierById.get(product.supplier_id);
    if (!supplier || supplier.status !== 'active') continue;
    if (product.catalog_product_id && !approvedCatalogIds.has(product.catalog_product_id)) continue;
    const latitude = supplier.latitude;
    const longitude = supplier.longitude;
    const distance = location && typeof latitude === 'number' && Number.isFinite(latitude)
      && typeof longitude === 'number' && Number.isFinite(longitude)
      ? haversineKm(location.lat, location.lng, latitude, longitude)
      : null;
    const normalizedName = product.name.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en');
    const key = normalizedName || `id:${product.id}`;
    const current = uniqueProducts.get(key);
    const betterCandidate = !current
      || (distance !== null && (current.distance === null || distance < current.distance))
      || (distance === current.distance && Number(product.stock) > Number(current.product.stock));
    if (betterCandidate) uniqueProducts.set(key, { product, distance });
  }

  return [...uniqueProducts.values()].sort((a, b) => {
    if (location) {
      if (a.distance === null && b.distance !== null) return 1;
      if (a.distance !== null && b.distance === null) return -1;
      if (a.distance !== null && b.distance !== null && a.distance !== b.distance) return a.distance - b.distance;
    }
    return a.product.name.localeCompare(b.product.name);
  });
}
