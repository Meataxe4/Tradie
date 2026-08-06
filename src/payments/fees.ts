/**
 * §6 Business model — the platform fee, computed server-side in AUD cents and
 * NEVER trusted from the client.
 *
 * D13 (Meeting 1, 5 Aug): 8% standard, 5% locked for life for foundation
 * trades. The rate is chosen by who does the work, not by the client.
 */
export const PLATFORM_FEE_BPS = 800; // 8.00% standard
export const FOUNDATION_FEE_BPS = 500; // 5.00% locked for life (D13)

export interface FeeBreakdown {
  amount: number; // GST-inclusive price the customer pays, in cents
  platform_fee: number; // commission, in cents
  trade_payout: number; // amount - platform_fee, in cents
  fee_bps: number; // the rate actually applied (auditable)
}

/** Compute the fee split for a captured amount (AUD cents). */
export function computeFee(amount: number, opts?: { foundation?: boolean }): FeeBreakdown {
  if (!Number.isInteger(amount) || amount < 0) {
    throw new Error(`Invalid amount (cents): ${amount}`);
  }
  const fee_bps = opts?.foundation ? FOUNDATION_FEE_BPS : PLATFORM_FEE_BPS;
  const platform_fee = Math.round((amount * fee_bps) / 10000);
  return { amount, platform_fee, trade_payout: amount - platform_fee, fee_bps };
}
