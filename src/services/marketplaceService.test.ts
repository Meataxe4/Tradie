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

describe("quote-seen: the tradie knows when the customer has looked", () => {
  it("markQuotesSeen stamps offered quotes once and keeps the first timestamp", async () => {
    const { store, market } = build();
    const created = await market.createJob({
      homeowner_id: "home-1",
      description: "A single power point in the bedroom is dead",
      photos: [], suburb: "Newtown", postcode: "2042", state: "NSW",
    });
    const quote = created.quote!;
    expect(quote.viewed_at).toBeUndefined();

    market.markQuotesSeen(created.job.id);
    expect(store.quotes.get(quote.id)?.viewed_at).toBe(NOW);

    // A second view must not move the timestamp.
    const later = new MarketplaceService(store, undefined as never, () => "2026-07-05T00:00:00.000Z");
    later.markQuotesSeen(created.job.id);
    expect(store.quotes.get(quote.id)?.viewed_at).toBe(NOW);
  });
});

describe("'Thanks, but I want a professional' (prefer_pro)", () => {
  it("a DIY-safe job still gets a vetted trade when the customer declines DIY", async () => {
    const { market } = build();
    const { job, triage, assigned } = await market.createJob({
      homeowner_id: "home-1",
      description: "My kitchen cabinet door won't close, the hinge seems loose",
      photos: [], suburb: "Newtown", postcode: "2042", state: "NSW",
      prefer_pro: true,
    });
    // The verdict stays honest — only the routing changes.
    expect(triage.final_verdict).toBe("DIY_SAFE");
    expect(job.status).not.toBe("DIY_RESOLVED");
    expect(assigned).not.toBeNull();
  });
});

describe("Meeting-1 product round (D13, gold, rebook, job-site chat)", () => {
  it("a 5-star review reserves that trade for the customer's next matching job", async () => {
    const { store, market } = build();
    const first = await market.createJob({
      homeowner_id: "home-1",
      description: "A single power point in the bedroom is dead",
      photos: [], suburb: "Newtown", postcode: "2042", state: "NSW",
    });
    market.acceptQuote(first.quote!.id);
    const booking = [...store.bookings.values()].find((b) => b.job_id === first.job.id)!;
    market.completeBooking(booking.id, "tradie");
    market.completeBooking(booking.id, "homeowner");
    market.submitReview({
      booking_id: booking.id, rater_role: "homeowner", rater_id: "home-1",
      overall: 5, dimensions: { communication: 5 }, text: "Great work",
    });

    const next = await market.createJob({
      homeowner_id: "home-1",
      description: "A ceiling fan in the lounge won't turn on",
      photos: [], suburb: "Newtown", postcode: "2042", state: "NSW",
    });
    expect(next.assigned?.user_id).toBe(booking.tradie_id);
    expect(next.job.rebook_reserved).toBe(true);
  });

  it("foundation trades pay 5%, standard trades pay 8% (D13)", async () => {
    const { store, market } = build();
    const created = await market.createJob({
      homeowner_id: "home-1",
      description: "A single power point in the bedroom is dead",
      photos: [], suburb: "Newtown", postcode: "2042", state: "NSW",
    });
    market.acceptQuote(created.quote!.id);
    const payment = [...store.payments.values()].find((p) => p.job_id === created.job.id)!;
    // Seeded tradies are foundation: 5% of the quote.
    expect(payment.platform_fee).toBe(Math.round(created.quote!.amount * 0.05));
  });

  it("a multi-trade project opens a job-site group thread with named senders", async () => {
    const { store, market } = build();
    const created = await market.createJob({
      homeowner_id: "home-1",
      description: "Water is leaking through the ceiling and the plasterboard needs replacing and repainting",
      photos: [], suburb: "Newtown", postcode: "2042", state: "NSW",
    });
    const project = created.project!;
    expect(store.threads.get(project.id)?.project_id).toBe(project.id);
    const msg = market.postMessage({
      thread_id: project.id, sender_role: "homeowner", sender_name: "Alex",
      body: "Hi all — call me on 0412 345 678",
    });
    expect(msg.sender_name).toBe("Alex");
    expect(msg.redacted).toBe(true); // masking stays on in the group channel
    expect(project.thread_id).toBe(project.id);
  });
});
