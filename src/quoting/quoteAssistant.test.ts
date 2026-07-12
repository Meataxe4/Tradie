import { describe, it, expect } from "vitest";
import {
  MockQuoteAssistantClient,
  quoteDraftSchema,
  type QuoteAssistantClient,
  type QuoteDraft,
  type QuoteDraftInput,
} from "./quoteAssistant.js";
import { MemoryStore } from "../store/memoryStore.js";
import { MarketplaceService } from "../services/marketplaceService.js";
import { TriageService } from "../triage/triageService.js";
import { MockTriageClient } from "../triage/llmClient.js";
import { seed } from "../seed.js";

const NOW = "2026-07-04T00:00:00.000Z";
const CONTACT = /(\d[\d\s().-]{7,}\d)|[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;

const input = (over: Partial<QuoteDraftInput> = {}): QuoteDraftInput => ({
  category: "electrical",
  suburb: "Newtown",
  urgency: "routine",
  required_licence_class: "Unrestricted electrical licence",
  job_spec: {
    title: "Faulty power point",
    summary: "A power point in the bedroom has stopped working",
    symptoms: ["Power point not working", "No power to that wall"],
    questions_for_site_visit: ["Are other outlets affected?"],
  },
  description: "A power point in the bedroom has stopped working",
  price_book_anchor: null,
  ...over,
});

describe("MockQuoteAssistantClient", () => {
  it("returns a schema-valid draft whose line items sum to the total", async () => {
    const draft = await new MockQuoteAssistantClient().draft(input());
    expect(() => quoteDraftSchema.parse(draft)).not.toThrow();
    const sum = draft.line_items.reduce((s, i) => s + i.amount, 0);
    expect(sum).toBe(draft.suggested_amount);
    expect(draft.suggested_amount).toBeGreaterThan(0);
    expect(Number.isInteger(draft.suggested_amount)).toBe(true);
    expect(draft.suggested_amount % 500).toBe(0); // rounded to the nearest $5
    expect(draft.source).toBe("assistant");
  });

  it("requires a compliance certificate for regulated work", async () => {
    const draft = await new MockQuoteAssistantClient().draft(input({ category: "electrical" }));
    expect(draft.scope_of_work.toLowerCase()).toContain("compliance certificate");
  });

  it("does not demand a certificate for non-regulated work", async () => {
    const draft = await new MockQuoteAssistantClient().draft(
      input({ category: "carpentry", required_licence_class: null }),
    );
    expect(draft.scope_of_work.toLowerCase()).not.toContain("compliance certificate");
  });

  it("leads with the price-book anchor when one is supplied", async () => {
    const draft = await new MockQuoteAssistantClient().draft(
      input({ price_book_anchor: { label: "Replace a mixer tap", amount: 28000 } }),
    );
    expect(draft.line_items[0]!.label).toBe("Replace a mixer tap");
    expect(draft.suggested_amount).toBe(28000);
  });

  it("loads the price for emergencies", async () => {
    const routine = await new MockQuoteAssistantClient().draft(input({ urgency: "routine" }));
    const emergency = await new MockQuoteAssistantClient().draft(input({ urgency: "emergency" }));
    expect(emergency.suggested_amount).toBeGreaterThan(routine.suggested_amount);
  });

  it("never emits contact details in customer-facing text", async () => {
    const draft = await new MockQuoteAssistantClient().draft(input());
    expect(CONTACT.test(draft.customer_message)).toBe(false);
    expect(CONTACT.test(draft.scope_of_work)).toBe(false);
  });
});

function build(assistant?: QuoteAssistantClient) {
  const store = new MemoryStore();
  seed(store, NOW);
  const market = new MarketplaceService(
    store,
    new TriageService({ llm: new MockTriageClient(), clock: () => NOW }),
    () => NOW,
    undefined,
    assistant,
  );
  return { store, market };
}

// An oven repair is NEEDS_LICENSED_PRO but has no price-book entry, so it's
// assigned to a trade and left AWAITING_QUOTE — the custom-quote path.
async function customJob(market: MarketplaceService) {
  return market.createJob({
    homeowner_id: "home-1",
    description: "The oven has stopped heating up properly",
    photos: [],
    suburb: "Newtown",
    postcode: "2042",
    state: "NSW",
  });
}

describe("MarketplaceService.draftQuote", () => {
  it("drafts a firm quote for the assigned trade on a custom job", async () => {
    const { market } = build();
    const created = await customJob(market);
    expect(created.job.status).toBe("AWAITING_QUOTE");
    expect(created.job.assigned_tradie_id).toBe("spark-1");

    const draft = await market.draftQuote({ job_id: created.job.id, tradie_id: "spark-1" });
    expect(draft.suggested_amount).toBeGreaterThan(0);
    expect(draft.line_items.length).toBeGreaterThan(0);
    // The draft's amount is directly usable to submit the firm quote.
    const quote = market.submitFirmQuote({
      job_id: created.job.id,
      tradie_id: "spark-1",
      amount: draft.suggested_amount,
      inclusions: draft.scope_of_work,
    });
    expect(quote.amount).toBe(draft.suggested_amount);
  });

  it("refuses to draft for a trade the job isn't assigned to", async () => {
    const { market } = build();
    const created = await customJob(market);
    await expect(
      market.draftQuote({ job_id: created.job.id, tradie_id: "plumb-1" }),
    ).rejects.toThrow(/assigned to you/);
  });

  it("refuses to draft once the job is no longer awaiting a quote", async () => {
    const { market } = build();
    // A power point is a price-book job → it goes straight to QUOTED.
    const created = await market.createJob({
      homeowner_id: "home-1",
      description: "A power point in the bedroom is dead",
      photos: [],
      suburb: "Newtown",
      postcode: "2042",
      state: "NSW",
    });
    expect(created.job.status).toBe("QUOTED");
    await expect(
      market.draftQuote({ job_id: created.job.id, tradie_id: "spark-1" }),
    ).rejects.toThrow(/awaiting a quote/);
  });

  it("masks any contact detail a model might slip into the draft (§9)", async () => {
    // Start from the mock and override only draft() with a leaky response.
    const leaky = new MockQuoteAssistantClient();
    leaky.draft = async (): Promise<QuoteDraft> => ({
      suggested_amount: 20000,
      line_items: [{ label: "Labour", amount: 20000 }],
      scope_of_work: "Repair the oven. Email me at sam@example.com to arrange.",
      customer_message: "Call me on 0400 123 456 to book it in.",
      assumptions: [],
      source: "assistant",
    });
    const { market } = build(leaky);
    const created = await customJob(market);
    const draft = await market.draftQuote({ job_id: created.job.id, tradie_id: "spark-1" });
    expect(CONTACT.test(draft.customer_message)).toBe(false);
    expect(CONTACT.test(draft.scope_of_work)).toBe(false);
    expect(draft.customer_message).toContain("[redacted]");
  });
});

/** Drive a job all the way to a completed booking with a homeowner review. */
async function completedWithReview(market: MarketplaceService) {
  const created = await customJob(market);
  const quote = market.submitFirmQuote({ job_id: created.job.id, tradie_id: "spark-1", amount: 20000, inclusions: "Repair" });
  const { booking } = market.acceptQuote(quote.id);
  market.completeBooking(booking.id);
  const review = market.submitReview({
    booking_id: booking.id,
    rater_role: "homeowner",
    rater_id: "home-1",
    overall: 5,
    dimensions: { quality: 5 },
    text: "Fantastic work, very tidy.",
  });
  return { booking, review };
}

describe("decline & reassign (UX #9)", () => {
  it("reassigns a declined quote to the next vetted trade and re-opens quoting", async () => {
    const { market } = build();
    // Ceiling fan job: spark-1 wins (electrical), price-book quote → QUOTED.
    const created = await market.createJob({
      homeowner_id: "home-1",
      description: "A ceiling fan in the lounge won't turn on",
      photos: [], suburb: "Newtown", postcode: "2042", state: "NSW",
    });
    expect(created.job.assigned_tradie_id).toBe("spark-1");
    // Only one electrician in the seed, so reassign finds nobody → closes honestly.
    const out = market.declineAndReassign(created.quote!.id);
    expect(out.quote.status).toBe("declined");
    expect(out.assigned).toBeNull();
    expect(out.job.status).toBe("DECLINED");
  });

  it("moves the job to the next trade when one exists", async () => {
    const { store, market } = build();
    // Add a second verified electrician so reassignment has somewhere to go.
    store.users.set("spark-2", { id: "spark-2", role: "tradie", email: "s2@example.com", created_at: NOW, status: "active" });
    store.tradies.set("spark-2", {
      user_id: "spark-2", business_name: "Marrickville Sparks", abn: "111", trades: ["electrical"],
      licences: [{ number: "EC-2", class: "Unrestricted electrical licence", state: "NSW", verified_status: "verified", expiry: "2027-01-01" }],
      insurance: { public_liability_expiry: "2027-01-01" }, service_postcodes: ["2042"],
      rating_avg: 4.5, jobs_completed: 10, verified_status: "verified", avg_response_minutes: 30,
    });
    const created = await market.createJob({
      homeowner_id: "home-1",
      description: "A ceiling fan in the lounge won't turn on",
      photos: [], suburb: "Newtown", postcode: "2042", state: "NSW",
    });
    const out = market.declineAndReassign(created.quote!.id);
    expect(out.assigned?.user_id).toBe("spark-2");
    expect(out.job.status).toBe("AWAITING_QUOTE");
    expect(out.job.quote_kind).toBe("custom");
  });
});

describe("Sorted By Copilot — the other AI aids", () => {
  it("#1 drafts a fair, rounded variation and masks contact detail", async () => {
    const { market } = build();
    const created = await customJob(market);
    const q = market.submitFirmQuote({ job_id: created.job.id, tradie_id: "spark-1", amount: 20000, inclusions: "Repair" });
    const { booking } = market.acceptQuote(q.id);
    const draft = await market.draftVariation({
      booking_id: booking.id,
      tradie_id: "spark-1",
      found_note: "The isolator switch also needs replacing — email me at x@y.com",
    });
    expect(draft.amount).toBeGreaterThan(0);
    expect(draft.amount % 500).toBe(0);
    expect(CONTACT.test(draft.customer_message)).toBe(false);
    expect(CONTACT.test(draft.reason)).toBe(false);
  });

  it("#1 refuses to draft a variation on a booking that isn't the trade's", async () => {
    const { market } = build();
    const created = await customJob(market);
    const q = market.submitFirmQuote({ job_id: created.job.id, tradie_id: "spark-1", amount: 20000, inclusions: "Repair" });
    const { booking } = market.acceptQuote(q.id);
    await expect(
      market.draftVariation({ booking_id: booking.id, tradie_id: "plumb-1", found_note: "x" }),
    ).rejects.toThrow(/isn't yours/);
  });

  it("#2 explains a quote and refuses if it isn't the homeowner's job", async () => {
    const { market } = build();
    const created = await customJob(market);
    const q = market.submitFirmQuote({ job_id: created.job.id, tradie_id: "spark-1", amount: 20000, inclusions: "Repair" });
    const out = await market.explainQuote({ quote_id: q.id, homeowner_id: "home-1" });
    expect(out.what_youre_paying_for.length).toBeGreaterThan(0);
    expect(out.plain_summary).toMatch(/\$200/);
    await expect(market.explainQuote({ quote_id: q.id, homeowner_id: "nobody" })).rejects.toThrow(/Not your job/);
  });

  it("#3 suggests an on-platform reply", async () => {
    const { market } = build();
    const created = await customJob(market);
    const q = market.submitFirmQuote({ job_id: created.job.id, tradie_id: "spark-1", amount: 20000, inclusions: "Repair" });
    market.postMessage({ thread_id: q.id, sender_role: "homeowner", body: "When can you come out?" });
    const out = await market.suggestReply({ thread_id: q.id, role: "tradie" });
    expect(out.suggestion.length).toBeGreaterThan(0);
    expect(CONTACT.test(out.suggestion)).toBe(false);
  });

  it("#4 drafts, persists and guards a review response", async () => {
    const { market } = build();
    const { review } = await completedWithReview(market);
    const draft = await market.draftReviewResponse({ review_id: review.id, tradie_id: "spark-1" });
    expect(draft.response.length).toBeGreaterThan(0);

    const responded = market.respondToReview({ review_id: review.id, tradie_id: "spark-1", response: draft.response });
    expect(responded.response).toBe(draft.response);
    expect(responded.responded_at).toBeTruthy();

    // One response only, and only the rated trade may respond.
    expect(() => market.respondToReview({ review_id: review.id, tradie_id: "spark-1", response: "again" })).toThrow(/already responded/);
    await expect(market.draftReviewResponse({ review_id: review.id, tradie_id: "plumb-1" })).rejects.toThrow(/written about you/);
  });
});
