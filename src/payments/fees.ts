/**
 * §6 Business model — the platform fee. 5% on completed jobs (locked), computed
 * server-side in AUD cents and NEVER trusted from the client.
 */
export const PLATFORM_FEE_BPS = 500; // 5.00%

export interface FeeBreakdown {
  amount: number; // GST-inclusive price the customer pays, in cents
  platform_fee: number; // 5% of amount, in cents
  trade_payout: number; // amount - platform_fee, in cents
}

/** Compute the fee split for a captured amount (AUD cents). */
export function computeFee(amount: number): FeeBreakdown {
  if (!Number.isInteger(amount) || amount < 0) {
    throw new Error(`Invalid amount (cents): ${amount}`);
  }
  const platform_fee = Math.round((amount * PLATFORM_FEE_BPS) / 10000);
  return { amount, platform_fee, trade_payout: amount - platform_fee };
}
