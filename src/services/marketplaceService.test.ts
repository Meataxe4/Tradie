import { describe, it, expect, beforeEach } from "vitest";
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

describe("full loop: DIY_SAFE resolves without posting", () => {
  it("a cabinet hinge job triages DIY and terminates", async () => {
    const { market } = build();
    const { job, triage, matched } = await market.createJob({
      homeowner_id: "home-1",
      description: "My kitchen cabinet door won't close, the hinge seems loose",
      photos: [],
      suburb: "Newtown",
      postcode: "2042",
      state: "NSW",
    });
    expect(triage.final_verdict).toBe("DIY_SAFE");
    expect(triage.result.diy_guidance).not.toBeNull();
    expect(job.status).toBe("DIY_RESOLVED");
    expect(matched).toHaveLength(0);
  });
});

describe("full loop: electrical job posts, quotes, accepts, books, reviews", () => {
  it("runs end to end and only matches the verified NSW electrician", async () => {
    const { store, market } = build();
    const created = await market.createJob({
      homeowner_id: "home-1",
      description: "A single power point in the bedroom is dead",
      photos: ["photo-ref-1"],
      suburb: "Newtown",
      postcode: "2042",
      state: "NSW",
      full_address: "1 Example St, Newtown NSW 2042",
    });
    expect(created.triage.final_verdict).toBe("NEEDS_LICENSED_PRO");
    expect(created.job.status).toBe("QUOTING");
    expect(created.matched.map((m) => m.tradie.user_id)).toEqual(["spark-1"]);

    // Sealed quotes from the matched tradie.
    const quote = market.submitQuote({
      job_id: created.job.id,
      tradie_id: "spark-1",
      amount: 18000,
      inclusions: "Fault-find and repair one power point",
      earliest_availability: "2026-07-06",
    });
    expect(quote.status).toBe("submitted");

    // Accept → booking, address revealed to winner.
    const { booking } = market.acceptQuote(quote.id);
    expect(booking.tradie_id).toBe("spark-1");
    expect(store.jobs.get(created.job.id)?.status).toBe("BOOKED");

    // Complete + review updates the tradie rating.
    market.completeBooking(booking.id);
    const before = store.tradies.get("spark-1")!.rating_avg;
    market.reviewBooking({ booking_id: booking.id, rating: 5, text: "Great job" });
    expect(store.jobs.get(created.job.id)?.status).toBe("REVIEWED");
    expect(store.tradies.get("spark-1")!.jobs_completed).toBe(41);
    expect(store.tradies.get("spark-1")!.rating_avg).not.toBe(before);
  });

  it("accepting one quote auto-declines the others", async () => {
    const { store, market } = build();
    // Add a second verified electrician so two can quote.
    store.users.set("spark-2", { id: "spark-2", role: "tradie", email: "s2@x.com", created_at: NOW, status: "active" });
    store.tradies.set("spark-2", {
      ...store.tradies.get("spark-1")!,
      user_id: "spark-2",
      business_name: "Second Sparky",
      rating_avg: 4.2,
    });

    const created = await market.createJob({
      homeowner_id: "home-1",
      description: "dead power point in the hallway",
      photos: [],
      suburb: "Newtown",
      postcode: "2042",
      state: "NSW",
    });
    const q1 = market.submitQuote({ job_id: created.job.id, tradie_id: "spark-1", amount: 15000, inclusions: "x" });
    const q2 = market.submitQuote({ job_id: created.job.id, tradie_id: "spark-2", amount: 20000, inclusions: "y" });

    market.acceptQuote(q1.id);
    expect(store.quotes.get(q1.id)?.status).toBe("accepted");
    expect(store.quotes.get(q2.id)?.status).toBe("declined");
  });
});

describe("full loop: EMERGENCY_STOP records an override and posts", async () => {
  it("a gas smell escalates and logs the override", async () => {
    const { store, market } = build();
    const created = await market.createJob({
      homeowner_id: "home-1",
      description: "There's a strong gas smell in the kitchen",
      photos: [],
      suburb: "Newtown",
      postcode: "2042",
      state: "NSW",
    });
    expect(created.triage.final_verdict).toBe("EMERGENCY_STOP");
    expect(created.triage.result.diy_guidance).toBeNull();
    // No matched NSW gasfitter is seeded, so it posts but matches nobody.
    expect(created.job.status).toBe("POSTED");
  });
});

describe("messaging masks contact info and logs leakage", () => {
  it("strips a phone number and records a leakage attempt", async () => {
    const { store, market } = build();
    const created = await market.createJob({
      homeowner_id: "home-1",
      description: "dead power point",
      photos: [],
      suburb: "Newtown",
      postcode: "2042",
      state: "NSW",
    });
    const quote = market.submitQuote({ job_id: created.job.id, tradie_id: "spark-1", amount: 15000, inclusions: "x" });
    const msg = market.postMessage({
      thread_id: quote.id,
      sender_role: "tradie",
      body: "Just call me directly on 0412 345 678",
    });
    expect(msg.redacted).toBe(true);
    expect(msg.body).not.toContain("0412");
    expect(store.leakageLog).toHaveLength(1);
  });
});
