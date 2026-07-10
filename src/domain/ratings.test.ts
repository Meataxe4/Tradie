import { describe, it, expect } from "vitest";
import { computeStrengths, dimensionsFor } from "./ratings.js";
import { MemoryStore } from "../store/memoryStore.js";
import { MarketplaceService } from "../services/marketplaceService.js";
import { TriageService } from "../triage/triageService.js";
import { MockTriageClient } from "../triage/llmClient.js";
import { seed } from "../seed.js";

describe("computeStrengths (§4)", () => {
  it("surfaces high-scoring dimensions as friendly strengths", () => {
    const reviews = [
      { dimensions: { timeliness: 5, tidiness: 5, quality: 4 } },
      { dimensions: { timeliness: 5, tidiness: 4, quality: 3 } },
    ];
    expect(computeStrengths(reviews)).toEqual(["Always on time", "Spotless cleanup"]);
  });
  it("needs a minimum number of reviews", () => {
    expect(computeStrengths([{ dimensions: { timeliness: 5 } }])).toEqual([]);
  });
  it("gives each role its own dimensions", () => {
    expect(dimensionsFor("homeowner")).toContain("tidiness");
    expect(dimensionsFor("tradie")).toContain("prompt_payment");
  });
});

const NOW = "2026-07-04T00:00:00.000Z";
function bookedJob() {
  const store = new MemoryStore();
  seed(store, NOW);
  const market = new MarketplaceService(store, new TriageService({ llm: new MockTriageClient(), clock: () => NOW }), () => NOW);
  return { store, market };
}

describe("two-way reviews through the marketplace (§4)", () => {
  it("both sides rate a completed job; only the customer's review closes it", async () => {
    const { store, market } = bookedJob();
    const created = await market.createJob({ homeowner_id: "home-1", description: "A power point in the bedroom is dead", photos: [], suburb: "Newtown", postcode: "2042", state: "NSW" });
    const { booking } = market.acceptQuote(created.quote!.id);
    market.completeBooking(booking.id);

    // Trade rates the customer first — job stays COMPLETED.
    market.submitReview({ booking_id: booking.id, rater_role: "tradie", rater_id: "spark-1", overall: 5, dimensions: { clear_scope: 5, prompt_payment: 5 }, text: "Easy customer" });
    expect(store.jobs.get(created.job.id)?.status).toBe("COMPLETED");
    expect(store.homeowners.get("home-1")?.rating_avg).toBe(5);

    // Customer rates the trade — closes the job (→ REVIEWED).
    market.submitReview({ booking_id: booking.id, rater_role: "homeowner", rater_id: "home-1", overall: 5, dimensions: { quality: 5, timeliness: 5 }, text: "Great" });
    expect(store.jobs.get(created.job.id)?.status).toBe("REVIEWED");

    // Can't rate twice from the same side.
    expect(() =>
      market.submitReview({ booking_id: booking.id, rater_role: "homeowner", rater_id: "home-1", overall: 4, dimensions: {}, text: "" }),
    ).toThrow(/already rated/);
  });

  it("rejects rating before completion (verified-paid only)", async () => {
    const { market } = bookedJob();
    const created = await market.createJob({ homeowner_id: "home-1", description: "A power point in the bedroom is dead", photos: [], suburb: "Newtown", postcode: "2042", state: "NSW" });
    const { booking } = market.acceptQuote(created.quote!.id); // not completed
    expect(() =>
      market.submitReview({ booking_id: booking.id, rater_role: "homeowner", rater_id: "home-1", overall: 5, dimensions: {}, text: "" }),
    ).toThrow(/completed and paid/);
  });
});
