/**
 * Real Claude-backed Quote Assistant. Only used when ANTHROPIC_API_KEY is set;
 * otherwise the app falls back to MockQuoteAssistantClient so it runs offline.
 *
 * Mirrors the triage AnthropicClient: fetch (no SDK dependency), low temperature,
 * and the response is parsed + schema-validated before it leaves here. A
 * malformed response throws; the service treats that as "no draft available"
 * and the trade simply fills the quote in manually (never a blocked flow).
 */
import {
  quoteDraftSchema,
  variationDraftSchema,
  quoteExplanationSchema,
  replySuggestionSchema,
  reviewResponseSchema,
  type AssistantClient,
  type QuoteDraft,
  type QuoteDraftInput,
  type VariationDraft,
  type VariationDraftInput,
  type QuoteExplanation,
  type ExplainQuoteInput,
  type ReplySuggestion,
  type SuggestReplyInput,
  type ReviewResponseDraft,
  type ReviewResponseInput,
} from "./quoteAssistant.js";
import { QUOTE_ASSISTANT_SYSTEM_PROMPT } from "./quotePrompt.js";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

export interface AnthropicQuoteClientOptions {
  apiKey: string;
  model?: string;
  maxTokens?: number;
}

export class AnthropicQuoteAssistantClient implements AssistantClient {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly maxTokens: number;

  constructor(opts: AnthropicQuoteClientOptions) {
    this.apiKey = opts.apiKey;
    this.model = opts.model ?? "claude-sonnet-5";
    this.maxTokens = opts.maxTokens ?? 1200;
  }

  /** One low-temperature call that returns a parsed JSON object. */
  private async callJson(system: string, userText: string, maxTokens?: number): Promise<Record<string, unknown>> {
    const res = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: maxTokens ?? this.maxTokens,
        temperature: 0.2,
        system,
        messages: [{ role: "user", content: userText }],
      }),
    });
    if (!res.ok) throw new Error(`Anthropic API error ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
    const text = data.content?.find((c) => c.type === "text")?.text ?? "";
    return extractJson(text) as Record<string, unknown>;
  }

  async draft(input: QuoteDraftInput): Promise<QuoteDraft> {
    const spec = input.job_spec;
    const userText =
      `Trade category: ${input.category}\n` +
      (input.suburb ? `Suburb: ${input.suburb}\n` : "") +
      `Urgency: ${input.urgency}\n` +
      (input.required_licence_class ? `Required licence: ${input.required_licence_class}\n` : "") +
      (input.price_book_anchor
        ? `Price-book anchor: ${input.price_book_anchor.label} = ${input.price_book_anchor.amount} cents\n`
        : "Price-book anchor: none (build up from metro rates)\n") +
      `\nJob title: ${spec?.title ?? "(none)"}\n` +
      `Summary: ${spec?.summary ?? input.description}\n` +
      `Symptoms: ${(spec?.symptoms ?? []).join("; ") || "(none)"}\n` +
      `On-site checks: ${(spec?.questions_for_site_visit ?? []).join("; ") || "(none)"}\n` +
      `\nReturn ONLY the JSON quote draft object.`;
    const json = await this.callJson(QUOTE_ASSISTANT_SYSTEM_PROMPT, userText);
    return quoteDraftSchema.parse({ ...json, source: "claude" });
  }

  async draftVariation(input: VariationDraftInput): Promise<VariationDraft> {
    const system =
      "You are the Sorted By Copilot helping a licensed trade raise a variation " +
      "(extra work found on site) for the customer to approve. Return ONLY JSON: " +
      '{ "amount": integer (extra AUD cents, GST-incl), "reason": string, "customer_message": string }. ' +
      "Price it fairly and conservatively. The message must explain the extra work, state the extra cost, " +
      "and reassure that it's added to the held payment only if they approve. Never include contact details.";
    const userText = `Trade category: ${input.category}\nUrgency: ${input.urgency}\nExtra work found: ${input.found_note}\n\nReturn ONLY the JSON.`;
    const json = await this.callJson(system, userText, 600);
    return variationDraftSchema.parse({ ...json, source: "claude" });
  }

  async explainQuote(input: ExplainQuoteInput): Promise<QuoteExplanation> {
    const system =
      "You are the Sorted By Copilot explaining a firm quote to a homeowner in plain, reassuring language. " +
      'Return ONLY JSON: { "plain_summary": string, "what_youre_paying_for": string[], "questions_to_ask": string[] }. ' +
      "Reinforce that the price is firm, GST-inclusive, from a vetted licensed trade, with payment held until they're happy. Never invent numbers.";
    const userText = `Job: ${input.job_title}\nCategory: ${input.category}\nPrice (cents, GST-incl): ${input.amount}\nQuote kind: ${input.kind}\nWhat's included: ${input.inclusions}\n\nReturn ONLY the JSON.`;
    const json = await this.callJson(system, userText, 700);
    return quoteExplanationSchema.parse({ ...json, source: "claude" });
  }

  async suggestReply(input: SuggestReplyInput): Promise<ReplySuggestion> {
    const system =
      `You are the Sorted By Copilot suggesting a short, professional in-app reply for the ${input.role}. ` +
      'Return ONLY JSON: { "suggestion": string }. Keep it under 60 words, friendly and clear. ' +
      "NEVER include phone numbers, emails, or any suggestion to move off the Sorted By app.";
    const convo = input.recent.map((m) => `${m.role}: ${m.body}`).join("\n");
    const userText = `Job: ${input.job_title}\nConversation so far:\n${convo}\n\nDraft the ${input.role}'s next reply. Return ONLY the JSON.`;
    const json = await this.callJson(system, userText, 400);
    return replySuggestionSchema.parse({ ...json, source: "claude" });
  }

  async draftReviewResponse(input: ReviewResponseInput): Promise<ReviewResponseDraft> {
    const system =
      `You are the Sorted By Copilot drafting ${input.business_name}'s public response to a customer review. ` +
      'Return ONLY JSON: { "response": string }. Be warm and professional; thank the customer. ' +
      "For a critical review, apologise sincerely and offer to make it right through Sorted By. Never be defensive. Never include contact details.";
    const userText = `Business: ${input.business_name}\nRating: ${input.overall}/5\nReview: ${input.text}\n\nReturn ONLY the JSON.`;
    const json = await this.callJson(system, userText, 400);
    return reviewResponseSchema.parse({ ...json, source: "claude" });
  }
}

function extractJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("No JSON object found in model response");
  }
  return JSON.parse(text.slice(start, end + 1));
}
