import type { Supplier } from './types';

export function visibleFarms(suppliers: Supplier[]): Supplier[] {
  return suppliers.filter((supplier) => !supplier.mergedIntoSupplierId);
}

export function mergeSourceIdsForTarget(
  candidates: Supplier[],
  selectedIds: string[],
  previousTargetId: string,
  nextTargetId: string,
): string[] {
  return candidates
    .filter((farm) => farm.id !== nextTargetId && (selectedIds.includes(farm.id) || farm.id === previousTargetId))
    .map((farm) => farm.id);
}

export function duplicateFarmGroups(suppliers: Supplier[]): Supplier[][] {
  const groups = new Map<string, Supplier[]>();
  for (const supplier of visibleFarms(suppliers)) {
    const key = `${supplier.name.trim().toLocaleLowerCase()}\u0000${supplier.region.trim().toLocaleLowerCase()}`;
    const group = groups.get(key) ?? [];
    group.push(supplier);
    groups.set(key, group);
  }
  return [...groups.values()].filter((group) => group.length > 1);
}
