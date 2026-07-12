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

export interface QuoteAssistantClient {
  draft(input: QuoteDraftInput): Promise<QuoteDraft>;
}

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
}
