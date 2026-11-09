export interface FeeTier {
  id: string;
  min_price_uzs: number;
  /** null = no upper bound */
  max_price_uzs: number | null;
  fee_uzs: number;
}

export interface FeeBreakdown {
  price_uzs: number;
  fee_uzs: number;
  /** What the client pays: the service price only (barber pays the fee). */
  client_total_uzs: number;
  barber_net_uzs: number;
  fee_tier_id: string | null;
}

/** Pick the tier whose inclusive [min, max] range contains the price. */
export function findTier(price: number, tiers: readonly FeeTier[]): FeeTier | undefined {
  return tiers.find((t) => price >= t.min_price_uzs && (t.max_price_uzs === null || price <= t.max_price_uzs));
}

export function computeFee(price: number, tiers: readonly FeeTier[]): FeeBreakdown {
  if (!Number.isInteger(price) || price < 0) throw new Error(`Invalid price: ${price}`);
  const tier = findTier(price, tiers);
  const fee = Math.min(tier?.fee_uzs ?? 0, price);
  return {
    price_uzs: price,
    fee_uzs: fee,
    client_total_uzs: price,
    barber_net_uzs: price - fee,
    fee_tier_id: tier?.id ?? null,
  };
}

/** Returns an error message if tiers overlap or are malformed, else null. */
export function validateTiers(tiers: readonly FeeTier[]): string | null {
  const sorted = [...tiers].sort((a, b) => a.min_price_uzs - b.min_price_uzs);
  for (let i = 0; i < sorted.length; i++) {
    const t = sorted[i];
    if (t.fee_uzs < 0 || t.min_price_uzs < 0) return 'Negative values are not allowed';
    if (t.max_price_uzs !== null && t.max_price_uzs < t.min_price_uzs) return 'Max must be ≥ min';
    const next = sorted[i + 1];
    if (next && (t.max_price_uzs === null || t.max_price_uzs >= next.min_price_uzs)) return 'Tiers overlap';
  }
  return null;
}

/** Default pilot tiers from the plan. */
export const DEFAULT_FEE_TIERS: FeeTier[] = [
  { id: 'tier-1', min_price_uzs: 0, max_price_uzs: 30000, fee_uzs: 1000 },
  { id: 'tier-2', min_price_uzs: 30001, max_price_uzs: 60000, fee_uzs: 2000 },
  { id: 'tier-3', min_price_uzs: 60001, max_price_uzs: null, fee_uzs: 3000 },
];
