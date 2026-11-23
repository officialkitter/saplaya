export type ClaimFilterOrder = {
  code: string;
  supplier_name: string;
  items?: { name: string }[];
};

export function claimMatchesFilters(
  order: ClaimFilterOrder,
  query: string,
  selectedProducts: ReadonlySet<string>,
): boolean {
  const term = query.trim().toLowerCase();
  const matchesQuery = !term
    || order.code.toLowerCase().includes(term)
    || order.supplier_name.toLowerCase().includes(term)
    || order.items?.some((item) => item.name.toLowerCase().includes(term)) === true;
  const matchesProducts = selectedProducts.size === 0
    || [...selectedProducts].every((name) => order.items?.some((item) => item.name === name));
  return matchesQuery && matchesProducts;
}

export function ordersMatchingProducts<T extends ClaimFilterOrder>(
  orders: readonly T[],
  selectedProducts: ReadonlySet<string>,
): T[] {
  if (!selectedProducts.size) return [];
  return orders.filter((order) =>
    [...selectedProducts].every((name) => order.items?.some((item) => item.name === name))
  );
}
