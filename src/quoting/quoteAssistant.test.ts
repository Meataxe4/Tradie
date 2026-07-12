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
    const leaky: QuoteAssistantClient = {
      async draft(): Promise<QuoteDraft> {
        return {
          suggested_amount: 20000,
          line_items: [{ label: "Labour", amount: 20000 }],
          scope_of_work: "Repair the oven. Email me at sam@example.com to arrange.",
          customer_message: "Call me on 0400 123 456 to book it in.",
          assumptions: [],
          source: "assistant",
        };
      },
    };
    const { market } = build(leaky);
    const created = await customJob(market);
    const draft = await market.draftQuote({ job_id: created.job.id, tradie_id: "spark-1" });
    expect(CONTACT.test(draft.customer_message)).toBe(false);
    expect(CONTACT.test(draft.scope_of_work)).toBe(false);
    expect(draft.customer_message).toContain("[redacted]");
  });
});
