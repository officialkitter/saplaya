export type OperationScope = {
  country_code: string;
  country_name?: string;
  region_code: string;
  region_name?: string;
  district_code: string | null;
  district_name?: string | null;
};

export type CommissionTier = {
  target_sales_tzs: number;
  commission_rate_pct: number;
};

export type CommissionPolicy = {
  margin_pool_pct: number;
  incentive_budget_pct: number;
  bonus_rate_pct: number;
};

export function weekBoundsUtc(now: Date): { start: Date; end: Date } {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const daysSinceMonday = (start.getUTCDay() + 6) % 7;
  start.setUTCDate(start.getUTCDate() - daysSinceMonday);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 7);
  return { start, end };
}

export function supplierMatchesScopes(
  supplier: { country_code: string | null; region_code: string | null; district_code: string | null },
  scopes: OperationScope[],
): boolean {
  return scopes.some((scope) => (
    supplier.country_code === scope.country_code
    && supplier.region_code === scope.region_code
    && (scope.district_code === null || supplier.district_code === scope.district_code)
  ));
}

export function calculateWeeklyCommission(
  salesValueTzs: number,
  policy: CommissionPolicy,
  tiers: CommissionTier[],
): {
  sales_value_tzs: number;
  margin_pool_tzs: number;
  target_sales_tzs: number | null;
  commission_rate_pct: number;
  commission_tzs: number;
  bonus_tzs: number;
  total_tzs: number;
} {
  const sales = Math.max(0, Math.round(salesValueTzs));
  const marginPool = Math.round(sales * policy.margin_pool_pct / 100);
  const tier = [...tiers]
    .filter((entry) => sales >= entry.target_sales_tzs)
    .sort((left, right) => right.target_sales_tzs - left.target_sales_tzs)[0];
  if (!tier) {
    return {
      sales_value_tzs: sales,
      margin_pool_tzs: marginPool,
      target_sales_tzs: null,
      commission_rate_pct: 0,
      commission_tzs: 0,
      bonus_tzs: 0,
      total_tzs: 0,
    };
  }

  const budget = Math.round(marginPool * policy.incentive_budget_pct / 100);
  const commission = Math.min(
    Math.round(marginPool * tier.commission_rate_pct / 100),
    budget,
  );
  const bonus = Math.min(
    Math.round(marginPool * policy.bonus_rate_pct / 100),
    Math.max(0, budget - commission),
  );
  return {
    sales_value_tzs: sales,
    margin_pool_tzs: marginPool,
    target_sales_tzs: tier.target_sales_tzs,
    commission_rate_pct: tier.commission_rate_pct,
    commission_tzs: commission,
    bonus_tzs: bonus,
    total_tzs: commission + bonus,
  };
}
