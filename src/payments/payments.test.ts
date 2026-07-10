import { describe, it, expect } from "vitest";
import { computeFee, PLATFORM_FEE_BPS } from "./fees.js";
import { MockPaymentProvider } from "./provider.js";
import { MemoryStore } from "../store/memoryStore.js";
import { MarketplaceService } from "../services/marketplaceService.js";
import { TriageService } from "../triage/triageService.js";
import { MockTriageClient } from "../triage/llmClient.js";
import { seed } from "../seed.js";

const NOW = "2026-07-04T00:00:00.000Z";

describe("fee math (§6)", () => {
  it("is 5%, in whole cents, server-side", () => {
    expect(PLATFORM_FEE_BPS).toBe(500);
    // Worked example from the brief: $1,650.00 -> $82.50 fee, $1,567.50 payout.
    expect(computeFee(165000)).toEqual({ amount: 165000, platform_fee: 8250, trade_payout: 156750 });
  });
  it("rounds to the nearest cent", () => {
    expect(computeFee(18500)).toEqual({ amount: 18500, platform_fee: 925, trade_payout: 17575 });
    expect(computeFee(9999).platform_fee).toBe(500); // 499.95 -> 500
  });
  it("rejects non-integer / negative amounts", () => {
    expect(() => computeFee(100.5)).toThrow();
    expect(() => computeFee(-1)).toThrow();
  });
});

describe("mock provider", () => {
  it("authorizes then captures a held payment", () => {
    const p = new MockPaymentProvider();
    const a = p.authorize({ amount: 18500, currency: "aud", job_id: "j", tradie_id: "t" });
    expect(a.status).toBe("authorized");
    const c = p.capture(a.ref, 18500, 925);
    expect(c).toEqual({ status: "captured", amount_captured: 18500, application_fee: 925 });
    expect(() => p.capture(a.ref, 18500, 925)).toThrow(); // can't capture twice
  });
});

function build() {
  const store = new MemoryStore();
  seed(store, NOW);
  const market = new MarketplaceService(store, new TriageService({ llm: new MockTriageClient(), clock: () => NOW }), () => NOW);
  return { store, market };
}

describe("escrow flow through the marketplace (§3)", () => {
  it("authorises at booking and captures with the 5% fee on completion", async () => {
    const { store, market } = build();
    const created = await market.createJob({ homeowner_id: "home-1", description: "A power point in the bedroom is dead", photos: [], suburb: "Newtown", postcode: "2042", state: "NSW" });
    const { booking } = market.acceptQuote(created.quote!.id);

    // Held, not captured.
    let payment = market.paymentForBooking(booking.id)!;
    expect(payment.status).toBe("authorized");
    expect(payment.amount_authorized).toBe(18500);
    expect(payment.trade_payout).toBe(17575); // provisional

    market.completeBooking(booking.id);
    payment = market.paymentForBooking(booking.id)!;
    expect(payment.status).toBe("captured");
    expect(payment.amount_captured).toBe(18500);
    expect(payment.platform_fee).toBe(925);
    expect(payment.trade_payout).toBe(17575);
    expect(store.payments.get(payment.id)?.captured_at).toBeTruthy();
  });

  it("an approved variation increases the captured amount and recomputes the fee", async () => {
    const { market } = build();
    const created = await market.createJob({ homeowner_id: "home-1", description: "A power point in the bedroom is dead", photos: [], suburb: "Newtown", postcode: "2042", state: "NSW" });
    const { booking } = market.acceptQuote(created.quote!.id);

    const v = market.proposeVariation({ booking_id: booking.id, tradie_id: "spark-1", amount: 5000, reason: "Extra cabling behind the wall" });
    expect(v.status).toBe("proposed");
    market.approveVariation(v.id);

    market.completeBooking(booking.id);
    const payment = market.paymentForBooking(booking.id)!;
    expect(payment.amount_captured).toBe(23500); // 18500 + 5000
    expect(payment.platform_fee).toBe(1175); // 5% of 23500
    expect(payment.trade_payout).toBe(22325);
  });

  it("a declined variation does not change the captured amount", async () => {
    const { market } = build();
    const created = await market.createJob({ homeowner_id: "home-1", description: "A power point in the bedroom is dead", photos: [], suburb: "Newtown", postcode: "2042", state: "NSW" });
    const { booking } = market.acceptQuote(created.quote!.id);
    const v = market.proposeVariation({ booking_id: booking.id, tradie_id: "spark-1", amount: 5000, reason: "x" });
    market.declineVariation(v.id);
    market.completeBooking(booking.id);
    expect(market.paymentForBooking(booking.id)!.amount_captured).toBe(18500);
  });
});
