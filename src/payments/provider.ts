/**
 * Payment provider seam. The marketplace depends only on this interface, so the
 * escrow flow runs offline with the mock and can swap to Stripe Connect later.
 *
 * Model (§3): authorise the full price at booking (funds held), capture on
 * completion with the 5% platform fee taken as an application fee and the
 * remainder transferred to the trade. The interface is synchronous to match the
 * synchronous services; a real Stripe adapter (async PaymentIntents with
 * capture_method=manual, application_fee_amount and transfer_data.destination)
 * is the follow-up integration behind the same shape.
 */
export interface AuthorizeInput {
  amount: number; // cents, GST-inclusive
  currency: "aud";
  job_id: string;
  tradie_id: string;
}

export interface AuthorizeResult {
  ref: string; // provider payment reference (e.g. PaymentIntent id)
  status: "authorized";
}

export interface CaptureResult {
  status: "captured";
  amount_captured: number;
  application_fee: number;
}

export interface PaymentProvider {
  readonly name: string;
  authorize(input: AuthorizeInput): AuthorizeResult;
  /** Capture up to the authorised amount, taking `applicationFee` for the platform. */
  capture(ref: string, finalAmount: number, applicationFee: number): CaptureResult;
  cancel(ref: string): { status: "canceled" };
}

/** Deterministic in-memory provider — the default, so payments work with no keys. */
export class MockPaymentProvider implements PaymentProvider {
  readonly name = "mock";
  private seq = 0;
  private readonly holds = new Map<string, AuthorizeInput>();

  authorize(input: AuthorizeInput): AuthorizeResult {
    if (!Number.isInteger(input.amount) || input.amount <= 0) {
      throw new Error("authorize: amount must be a positive integer (cents)");
    }
    const ref = `mock_pi_${++this.seq}`;
    this.holds.set(ref, input);
    return { ref, status: "authorized" };
  }

  capture(ref: string, finalAmount: number, applicationFee: number): CaptureResult {
    if (!this.holds.has(ref)) throw new Error(`capture: unknown payment ${ref}`);
    this.holds.delete(ref);
    return { status: "captured", amount_captured: finalAmount, application_fee: applicationFee };
  }

  cancel(ref: string): { status: "canceled" } {
    this.holds.delete(ref);
    return { status: "canceled" };
  }
}
