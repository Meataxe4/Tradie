import { describe, it, expect } from "vitest";
import { MemoryStore } from "../store/memoryStore.js";
import { MarketplaceService } from "./marketplaceService.js";
import { TriageService } from "../triage/triageService.js";
import { MockTriageClient } from "../triage/llmClient.js";
import { seed } from "../seed.js";

const NOW = "2026-07-04T00:00:00.000Z";

function build() {
  const store = new MemoryStore();
  seed(store, NOW);
  const triageSvc = new TriageService({ llm: new MockTriageClient(), clock: () => NOW });
  const market = new MarketplaceService(store, triageSvc, () => NOW);
  return { store, market };
}

describe("DIY_SAFE resolves without assigning a trade", () => {
  it("a cabinet hinge job triages DIY and terminates", async () => {
    const { market } = build();
    const { job, triage, assigned, quote } = await market.createJob({
      homeowner_id: "home-1",
      description: "My kitchen cabinet door won't close, the hinge seems loose",
      photos: [], suburb: "Newtown", postcode: "2042", state: "NSW",
    });
    expect(triage.final_verdict).toBe("DIY_SAFE");
    expect(triage.result.diy_guidance).not.toBeNull();
    expect(job.status).toBe("DIY_RESOLVED");
    expect(assigned).toBeNull();
    expect(quote).toBeNull();
  });
});

describe("price-book job: instant firm quote, assigned to one trade", () => {
  it("assigns the NSW electrician and produces an instant firm quote", async () => {
    const { store, market } = build();
    const created = await market.createJob({
      homeowner_id: "home-1",
      description: "A single power point in the bedroom is dead",
      photos: ["photo-ref-1"], suburb: "Newtown", postcode: "2042", state: "NSW",
      full_address: "1 Example St, Newtown NSW 2042",
    });
    expect(created.triage.final_verdict).toBe("NEEDS_LICENSED_PRO");
    expect(created.assigned?.user_id).toBe("spark-1");
    expect(created.job.status).toBe("QUOTED");
    expect(created.job.quote_kind).toBe("price_book");
    expect(created.quote?.kind).toBe("price_book");
    expect(created.quote?.amount).toBe(18500); // firm, GST-inclusive
    expect(created.quote?.status).toBe("offered");

    // Accept the firm quote → booked.
    const { booking } = market.acceptQuote(created.quote!.id);
    expect(booking.tradie_id).toBe("spark-1");
    expect(store.jobs.get(created.job.id)?.status).toBe("BOOKED");

    // Complete + review updates the tradie rating.
    market.completeBooking(booking.id);
    const before = store.tradies.get("spark-1")!.rating_avg;
    market.submitReview({
      booking_id: booking.id, rater_role: "homeowner", rater_id: "home-1",
      overall: 5, dimensions: { quality: 5, timeliness: 5, communication: 5, tidiness: 5, value: 4 }, text: "Great job",
    });
    expect(store.jobs.get(created.job.id)?.status).toBe("REVIEWED");
    expect(store.tradies.get("spark-1")!.jobs_completed).toBe(41);
    expect(store.tradies.get("spark-1")!.rating_avg).not.toBe(before);
  });
});

describe("custom job: routed to the assigned trade for a firm quote", () => {
  it("only the assigned trade can quote; then it can be accepted", async () => {
    const { store, market } = build();
    const created = await market.createJob({
      homeowner_id: "home-1",
      description: "There's a burst pipe under the kitchen sink",
      photos: [], suburb: "Newtown", postcode: "2042", state: "NSW",
    });
    expect(created.assigned?.user_id).toBe("plumb-1");
    expect(created.job.status).toBe("AWAITING_QUOTE");
    expect(created.job.quote_kind).toBe("custom");
    expect(created.quote).toBeNull();

    // A trade the job isn't assigned to cannot quote.
    expect(() =>
      market.submitFirmQuote({ job_id: created.job.id, tradie_id: "spark-1", amount: 30000, inclusions: "x" }),
    ).toThrow(/assigned/);

    // The assigned trade returns a firm quote.
    const quote = market.submitFirmQuote({
      job_id: created.job.id, tradie_id: "plumb-1", amount: 42000, inclusions: "Cut out and replace the burst section",
    });
    expect(quote.kind).toBe("custom");
    expect(store.jobs.get(created.job.id)?.status).toBe("QUOTED");

    market.acceptQuote(quote.id);
    expect(store.jobs.get(created.job.id)?.status).toBe("BOOKED");
  });
});

describe("EMERGENCY_STOP records an override; no eligible trade leaves it awaiting", () => {
  it("a gas smell escalates and logs the override", async () => {
    const { store, market } = build();
    const created = await market.createJob({
      homeowner_id: "home-1",
      description: "There's a strong gas smell in the kitchen",
      photos: [], suburb: "Newtown", postcode: "2042", state: "NSW",
    });
    expect(created.triage.final_verdict).toBe("EMERGENCY_STOP");
    expect(created.triage.result.diy_guidance).toBeNull();
    // No NSW gasfitter is seeded, so it can't be assigned yet.
    expect(created.assigned).toBeNull();
    expect(created.job.status).toBe("AWAITING_QUOTE");
  });
});

describe("messaging masks contact info and logs leakage", () => {
  it("strips a phone number and records a leakage attempt", async () => {
    const { store, market } = build();
    const created = await market.createJob({
      homeowner_id: "home-1",
      description: "dead power point",
      photos: [], suburb: "Newtown", postcode: "2042", state: "NSW",
    });
    // Price-book job already has a firm quote + thread.
    const threadId = created.quote!.id;
    const msg = market.postMessage({ thread_id: threadId, sender_role: "tradie", body: "Just call me directly on 0412 345 678" });
    expect(msg.redacted).toBe(true);
    expect(msg.body).not.toContain("0412");
    expect(store.leakageLog).toHaveLength(1);
  });
});
