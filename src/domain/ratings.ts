/**
 * §4 Two-way structured ratings. Mandatory to close a job, verified-paid only,
 * multiple dimensions plus a written note. Trades rate customers too, which
 * keeps both sides honest and lets great customers get priority service.
 */
export type RaterRole = "homeowner" | "tradie";

/** Dimensions a customer scores the trade on. */
export const TRADE_DIMENSIONS = ["quality", "timeliness", "communication", "tidiness", "value"] as const;
export type TradeDimension = (typeof TRADE_DIMENSIONS)[number];

/** Dimensions a trade scores the customer on. */
export const CUSTOMER_DIMENSIONS = ["clear_scope", "communication", "access", "prompt_payment"] as const;
export type CustomerDimension = (typeof CUSTOMER_DIMENSIONS)[number];

export function dimensionsFor(role: RaterRole): readonly string[] {
  // The customer (homeowner) rates the trade; the trade rates the customer.
  return role === "homeowner" ? TRADE_DIMENSIONS : CUSTOMER_DIMENSIONS;
}

/** Human labels for the badge-worthy strengths surfaced on a trade's profile. */
export const STRENGTH_LABELS: Record<string, string> = {
  quality: "Great workmanship",
  timeliness: "Always on time",
  communication: "Great communicator",
  tidiness: "Spotless cleanup",
  value: "Great value",
};

/**
 * Aggregate a trade's dimension scores into up to `max` surfaced strengths —
 * dimensions averaging at or above `threshold` across their reviews.
 */
export function computeStrengths(
  reviews: Array<{ dimensions: Record<string, number> }>,
  { threshold = 4.5, max = 2, minReviews = 2 } = {},
): string[] {
  if (reviews.length < minReviews) return [];
  const sums = new Map<string, { total: number; n: number }>();
  for (const r of reviews) {
    for (const [k, v] of Object.entries(r.dimensions)) {
      const cur = sums.get(k) ?? { total: 0, n: 0 };
      cur.total += v;
      cur.n += 1;
      sums.set(k, cur);
    }
  }
  return [...sums.entries()]
    .map(([k, { total, n }]) => ({ k, avg: total / n }))
    .filter((d) => d.avg >= threshold && STRENGTH_LABELS[d.k])
    .sort((a, b) => b.avg - a.avg)
    .slice(0, max)
    .map((d) => STRENGTH_LABELS[d.k]!);
}
