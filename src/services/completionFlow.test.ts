import { describe, it, expect } from "vitest";
import { MemoryStore } from "../store/memoryStore.js";
import { MarketplaceService } from "./marketplaceService.js";
import { TriageService } from "../triage/triageService.js";
import { MockTriageClient } from "../triage/llmClient.js";
import { seed } from "../seed.js";

const T0 = "2026-07-04T00:00:00.000Z";
const plusHours = (iso: string, h: number) => new Date(new Date(iso).getTime() + h * 3600 * 1000).toISOString();

function build() {
  let now = T0;
  const clock = () => now;
  const store = new MemoryStore();
  seed(store, T0);
  const market = new MarketplaceService(store, new TriageService({ llm: new MockTriageClient(), clock }), clock);
  return { store, market, tick: (h: number) => { now = plusHours(now, h); } };
}

async function booked(market: MarketplaceService) {
  const created = await market.createJob({
    homeowner_id: "home-1", description: "A power point in the bedroom is dead",
    photos: [], suburb: "Newtown", postcode: "2042", state: "NSW",
  });
  return market.acceptQuote(created.quote!.id).booking;
}

describe("anti-leakage completion flow", () => {
  it("a tradie can only REQUEST completion — nothing is captured yet", async () => {
    const { market } = build();
    const b = await booked(market);
    const after = market.completeBooking(b.id, "tradie");
    expect(after.status).toBe("scheduled");
    expect(after.completion_requested_by).toBe("tradie");
    expect(after.auto_release_at).toBe(plusHours(T0, 48));
    expect(market.paymentForBooking(b.id)!.status).toBe("authorized"); // still held
  });

  it("the homeowner confirming finalises and captures immediately", async () => {
    const { market } = build();
    const b = await booked(market);
    market.completeBooking(b.id, "tradie");
    const done = market.completeBooking(b.id, "homeowner");
    expect(done.status).toBe("completed");
    expect(market.paymentForBooking(b.id)!.status).toBe("captured");
  });

  it("silence auto-releases after 48h — inaction favours the platform", async () => {
    const { market, tick } = build();
    const b = await booked(market);
    market.completeBooking(b.id, "tradie");
    tick(47);
    expect(market.sweepAutoReleases()).toBe(0); // window still open
    tick(2); // now 49h after request
    expect(market.sweepAutoReleases()).toBe(1);
    expect(market.paymentForBooking(b.id)!.status).toBe("captured");
    expect(market.paymentForBooking(b.id)!.platform_fee).toBe(925); // fee collected
  });

  it("a dispute pauses auto-release and surfaces in the ops queue", async () => {
    const { market, tick } = build();
    const b = await booked(market);
    market.completeBooking(b.id, "tradie");
    market.disputeBooking({ booking_id: b.id, homeowner_id: "home-1", reason: "Outlet still dead" });
    tick(72);
    expect(market.sweepAutoReleases()).toBe(0); // paused
    expect(market.paymentForBooking(b.id)!.status).toBe("authorized");
    expect(market.disputedBookings().map((x) => x.id)).toEqual([b.id]);
    // Ops can still finalise once resolved.
    market.completeBooking(b.id, "admin");
    expect(market.paymentForBooking(b.id)!.status).toBe("captured");
  });

  it("silent bookings (no request, no dispute) go stale after 7 days", async () => {
    const { market, tick } = build();
    const b = await booked(market);
    expect(market.staleBookings()).toHaveLength(0);
    tick(8 * 24);
    expect(market.staleBookings().map((x) => x.id)).toEqual([b.id]);
    // A completion request takes it out of the stale bucket (it's now in the window).
    market.completeBooking(b.id, "tradie");
    expect(market.staleBookings()).toHaveLength(0);
  });
});

describe("book-again preference", () => {
  it("assigns the preferred trade when they're still eligible", async () => {
    const { store, market } = build();
    // Add a better-ranked second electrician; preference must still win.
    store.users.set("spark-2", { id: "spark-2", role: "tradie", email: "s2@x.com", created_at: T0, status: "active" });
    store.tradies.set("spark-2", {
      user_id: "spark-2", business_name: "Faster Sparks", abn: "1", trades: ["electrical"],
      licences: [{ number: "E2", class: "Unrestricted electrical licence", state: "NSW", verified_status: "verified", expiry: "2027-01-01" }],
      insurance: { public_liability_expiry: "2027-01-01" }, service_postcodes: ["2042"],
      rating_avg: 5, jobs_completed: 100, verified_status: "verified", avg_response_minutes: 5,
    });
    const res = await market.createJob({
      homeowner_id: "home-1", description: "A power point in the bedroom is dead",
      photos: [], suburb: "Newtown", postcode: "2042", state: "NSW",
      preferred_tradie_id: "spark-1",
    });
    expect(res.job.assigned_tradie_id).toBe("spark-1");
  });

  it("falls back to normal matching when the preferred trade can't serve", async () => {
    const { market } = build();
    const res = await market.createJob({
      homeowner_id: "home-1", description: "A power point in the bedroom is dead",
      photos: [], suburb: "Newtown", postcode: "2042", state: "NSW",
      preferred_tradie_id: "plumb-1", // wrong trade for the job
    });
    expect(res.job.assigned_tradie_id).toBe("spark-1");
  });
});
