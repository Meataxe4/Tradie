/**
 * AI Quote Assistant — drafts a firm quote for the assigned trade on a custom
 * (routed) job. The marketplace depends only on the QuoteAssistantClient
 * interface, so this is fully testable offline and a real Claude client can be
 * swapped in without touching the service (mirrors the triage LLM seam).
 *
 * Two implementations:
 *   - MockQuoteAssistantClient   deterministic; used by tests and by default
 *                                when no ANTHROPIC_API_KEY is configured.
 *   - AnthropicQuoteAssistantClient  real Claude call (see anthropicQuoteClient.ts).
 *
 * The draft is an AID, not a commitment: the trade edits it and submits the
 * firm quote through the normal flow. Nothing here is persisted.
 */
import { z } from "zod";
import type { Category } from "../triage/schema.js";

export interface QuoteDraftInput {
  category: Category;
  suburb?: string;
  urgency: "emergency" | "urgent" | "routine";
  required_licence_class?: string | null;
  /** The AI triage job spec (title/summary/symptoms/on-site checks). */
  job_spec: {
    title: string;
    summary: string;
    symptoms: string[];
    questions_for_site_visit: string[];
  } | null;
  /** Free-text fallback when there's no structured spec. */
  description: string;
  /** A typical Sorted By price (cents) for this work, when one exists. */
  price_book_anchor?: { label: string; amount: number } | null;
}

export const quoteLineItemSchema = z.object({
  label: z.string().min(1),
  amount: z.number().int(), // AUD cents
});

export const quoteDraftSchema = z.object({
  suggested_amount: z.number().int().positive(), // AUD cents, GST-inclusive
  line_items: z.array(quoteLineItemSchema).min(1),
  scope_of_work: z.string().min(1),
  customer_message: z.string().min(1),
  assumptions: z.array(z.string()),
  /** Which client produced this draft (telemetry / UI hint). */
  source: z.enum(["assistant", "claude"]),
});

export type QuoteLineItem = z.infer<typeof quoteLineItemSchema>;
export type QuoteDraft = z.infer<typeof quoteDraftSchema>;

// ---- variation drafting (#1) ----

export interface VariationDraftInput {
  category: Category;
  urgency: "emergency" | "urgent" | "routine";
  /** What the trade found on site / typed in. */
  found_note: string;
}

export const variationDraftSchema = z.object({
  amount: z.number().int().positive(), // extra AUD cents, GST-inclusive
  reason: z.string().min(1),
  customer_message: z.string().min(1),
  source: z.enum(["assistant", "claude"]),
});
export type VariationDraft = z.infer<typeof variationDraftSchema>;

// ---- explain a quote to the homeowner (#2) ----

export interface ExplainQuoteInput {
  amount: number; // cents
  inclusions: string;
  kind: "price_book" | "custom";
  category: Category;
  job_title: string;
}

export const quoteExplanationSchema = z.object({
  plain_summary: z.string().min(1),
  what_youre_paying_for: z.array(z.string()).min(1),
  questions_to_ask: z.array(z.string()),
  source: z.enum(["assistant", "claude"]),
});
export type QuoteExplanation = z.infer<typeof quoteExplanationSchema>;

// ---- suggest a chat reply (#3) ----

export interface SuggestReplyInput {
  role: "homeowner" | "tradie";
  job_title: string;
  /** Most recent messages, oldest→newest. */
  recent: Array<{ role: "homeowner" | "tradie"; body: string }>;
}

export const replySuggestionSchema = z.object({
  suggestion: z.string().min(1),
  source: z.enum(["assistant", "claude"]),
});
export type ReplySuggestion = z.infer<typeof replySuggestionSchema>;

// ---- draft a response to a review (#4) ----

export interface ReviewResponseInput {
  business_name: string;
  overall: number;
  text: string;
}

export const reviewResponseSchema = z.object({
  response: z.string().min(1),
  source: z.enum(["assistant", "claude"]),
});
export type ReviewResponseDraft = z.infer<typeof reviewResponseSchema>;

/**
 * The Sorted By Copilot seam. One client covers every in-product AI aid so the
 * marketplace depends on a single interface (mock offline, Claude when keyed).
 * Kept named QuoteAssistantClient for back-compat with existing call sites.
 */
export interface AssistantClient {
  draft(input: QuoteDraftInput): Promise<QuoteDraft>;
  draftVariation(input: VariationDraftInput): Promise<VariationDraft>;
  explainQuote(input: ExplainQuoteInput): Promise<QuoteExplanation>;
  suggestReply(input: SuggestReplyInput): Promise<ReplySuggestion>;
  draftReviewResponse(input: ReviewResponseInput): Promise<ReviewResponseDraft>;
}
export type QuoteAssistantClient = AssistantClient;

// ---- deterministic mock ----

/** Typical Inner West metro rates (AUD cents, GST-inclusive). */
const RATES: Record<Category, { callout: number; hourly: number }> = {
  electrical: { callout: 8800, hourly: 12000 },
  plumbing_water: { callout: 9900, hourly: 13500 },
  gas: { callout: 12000, hourly: 15000 },
  hvac: { callout: 12000, hourly: 14000 },
  structural: { callout: 15000, hourly: 16000 },
  carpentry: { callout: 7000, hourly: 9500 },
  appliance: { callout: 9000, hourly: 11000 },
  locksmith: { callout: 9000, hourly: 12000 },
  handyman: { callout: 6500, hourly: 8500 },
  other: { callout: 8000, hourly: 10000 },
};

const REGULATED: ReadonlySet<Category> = new Set(["electrical", "gas", "plumbing_water", "hvac"]);

const round500 = (cents: number) => Math.round(cents / 500) * 500;
const money = (cents: number) => `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;

/**
 * Builds a sensible firm draft from the job spec and price-book anchor. The
 * output is deterministic for a given input so tests and the live demo behave
 * predictably — the real Claude client returns the same shape.
 */
export class MockQuoteAssistantClient implements QuoteAssistantClient {
  async draft(input: QuoteDraftInput): Promise<QuoteDraft> {
    const rate = RATES[input.category] ?? RATES.other;
    const spec = input.job_spec;
    const title = (spec?.title ?? input.description).trim();
    const summary = (spec?.summary ?? input.description).trim();
    const symptoms = spec?.symptoms ?? [];
    const checks = spec?.questions_for_site_visit ?? [];
    const regulated = REGULATED.has(input.category);

    // Estimate labour: base call, +30min per extra symptom, +urgency loading.
    let hours = 1.5;
    if (symptoms.length >= 2) hours += 0.5;
    if (input.urgency === "emergency") hours += 0.5;
    else if (input.urgency === "urgent") hours += 0.25;

    const items: QuoteLineItem[] = [];
    if (input.price_book_anchor) {
      // Anchor present → lead with it, add urgency loading only.
      items.push({ label: input.price_book_anchor.label, amount: input.price_book_anchor.amount });
      if (input.urgency === "emergency") {
        items.push({ label: "After-hours / emergency attendance", amount: 6000 });
      }
    } else {
      const labour = Math.round(rate.hourly * hours);
      const materials = Math.max(2000, round500(Math.round(labour * 0.15)));
      items.push({ label: "Call-out & on-site diagnosis", amount: rate.callout });
      items.push({ label: `Labour (approx. ${hours.toFixed(hours % 1 === 0 ? 0 : 1)} hr)`, amount: labour });
      items.push({ label: "Materials & consumables allowance", amount: materials });
    }

    // Round the total to a clean figure; absorb the delta into the last line so
    // the items always sum to suggested_amount (schema-enforced downstream).
    const raw = items.reduce((s, i) => s + i.amount, 0);
    const total = Math.max(round500(raw), raw > 0 ? 500 : 500);
    const last = items[items.length - 1]!;
    last.amount += total - raw;

    const certify = regulated ? "test and provide a compliance certificate" : "test and confirm it's working";
    const symptomLine = symptoms.length ? ` Reported: ${symptoms.join("; ")}.` : "";
    const scope_of_work =
      `Attend site and fault-find the ${title.toLowerCase()}.${symptomLine} ` +
      `Carry out the repair, then ${certify} before leaving.`;

    const assumptions: string[] = [
      "Standard access to the work area during business hours.",
      "No concealed damage (water, pest or structural) behind the fault.",
    ];
    if (regulated) assumptions.push("Scope confirmed against NSW licensing requirements on site.");
    if (checks.length) assumptions.push(`Subject to on-site checks: ${checks.join("; ")}.`);

    const customer_message =
      `Thanks for the details — I've reviewed what Sorted By sent through. ` +
      `Based on ${summary.toLowerCase()}, my firm, GST-inclusive price is ${money(total)}. ` +
      `That covers ${input.price_book_anchor ? input.price_book_anchor.label.toLowerCase() : "attendance, diagnosis, labour and materials"}, ` +
      `with ${certify}. Payment's held securely by Sorted By and only released once you're happy the job's done. ` +
      `If anything extra comes up on site, I'll send it as a variation for you to approve first.`;

    return quoteDraftSchema.parse({
      suggested_amount: total,
      line_items: items,
      scope_of_work,
      customer_message,
      assumptions,
      source: "assistant",
    });
  }

  async draftVariation(input: VariationDraftInput): Promise<VariationDraft> {
    const rate = RATES[input.category] ?? RATES.other;
    // Price the extra work at ~1 hour of labour + a small materials allowance,
    // nudged by urgency, rounded to the nearest $5. A fair, conservative default.
    let hours = 1;
    if (input.urgency === "emergency") hours += 0.5;
    const labour = Math.round(rate.hourly * hours);
    const materials = Math.max(1500, round500(Math.round(labour * 0.2)));
    const amount = Math.max(round500(labour + materials), 500);
    const note = input.found_note.trim() || "additional work found on site";
    const reason = note.charAt(0).toUpperCase() + note.slice(1);
    const customer_message =
      `While on site I found extra work needed: ${note.toLowerCase()}. ` +
      `To do it properly I'd need an additional ${money(amount)} (GST incl.), which covers the extra labour and materials. ` +
      `It's added to the held payment only if you approve — nothing proceeds until you say yes.`;
    return variationDraftSchema.parse({ amount, reason, customer_message, source: "assistant" });
  }

  async explainQuote(input: ExplainQuoteInput): Promise<QuoteExplanation> {
    const regulated = REGULATED.has(input.category);
    const plain_summary =
      `This is a single, firm price of ${money(input.amount)} (GST included) to ${input.job_title.toLowerCase()}. ` +
      `${input.kind === "price_book" ? "It's a standard Sorted By fixed price for this job" : "Your assigned trade set this price for your specific job"} — ` +
      `there's no bidding and no surprise add-ons.`;
    const what_youre_paying_for = [
      input.inclusions.trim() || "Attendance, diagnosis and the repair",
      "A vetted, licensed local trade — not the cheapest bidder",
      regulated ? "Testing and a compliance certificate for regulated work" : "Testing to confirm the fix works",
      "Payment held securely and only released once you're happy",
    ];
    const questions_to_ask = [
      "Roughly how long will the job take?",
      "Is there anything that could change the price on the day?",
      regulated ? "Will I get the compliance certificate on completion?" : "Is the work guaranteed?",
    ];
    return quoteExplanationSchema.parse({ plain_summary, what_youre_paying_for, questions_to_ask, source: "assistant" });
  }

  async suggestReply(input: SuggestReplyInput): Promise<ReplySuggestion> {
    const last = [...input.recent].reverse().find((m) => m.role !== input.role);
    const theirs = last?.body.toLowerCase() ?? "";
    const asksTime = /(when|time|day|date|available|book|schedule)/.test(theirs);
    const asksPrice = /(price|cost|how much|quote|\$)/.test(theirs);
    let suggestion: string;
    if (input.role === "tradie") {
      suggestion = asksTime
        ? "Thanks for getting back to me. I can lock in a time through the app — what days generally suit you this week and I'll confirm the slot here?"
        : asksPrice
          ? "Happy to walk you through the quote — the price is firm and GST-inclusive, and payment stays held by Sorted By until you're happy the job's done. Anything in particular you'd like me to clarify?"
          : `Thanks for the message about ${input.job_title.toLowerCase()}. Happy to help — is there anything else you'd like to know before we lock it in?`;
    } else {
      suggestion = asksTime
        ? "Thanks! Mornings generally work best for me this week — could you confirm a time here in the app?"
        : `Thanks for the update on ${input.job_title.toLowerCase()}. That sounds good — happy to go ahead. Let me know the next step.`;
    }
    return replySuggestionSchema.parse({ suggestion, source: "assistant" });
  }

  async draftReviewResponse(input: ReviewResponseInput): Promise<ReviewResponseDraft> {
    const positive = input.overall >= 4;
    const response = positive
      ? `Thanks so much for the kind words and the ${input.overall}-star review — it genuinely means a lot to the ${input.business_name} team. It was a pleasure helping out, and we're glad we could sort it. Don't hesitate to reach out through Sorted By if anything else comes up.`
      : `Thanks for taking the time to leave your feedback. We're sorry it wasn't a 5-star experience — that's not the standard we hold ourselves to at ${input.business_name}. We'd genuinely like to make it right; please reach out through Sorted By so we can look into it.`;
    return reviewResponseSchema.parse({ response, source: "assistant" });
  }
}
