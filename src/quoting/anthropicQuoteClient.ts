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
  type QuoteAssistantClient,
  type QuoteDraft,
  type QuoteDraftInput,
} from "./quoteAssistant.js";
import { QUOTE_ASSISTANT_SYSTEM_PROMPT } from "./quotePrompt.js";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

export interface AnthropicQuoteClientOptions {
  apiKey: string;
  model?: string;
  maxTokens?: number;
}

export class AnthropicQuoteAssistantClient implements QuoteAssistantClient {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly maxTokens: number;

  constructor(opts: AnthropicQuoteClientOptions) {
    this.apiKey = opts.apiKey;
    this.model = opts.model ?? "claude-sonnet-5";
    this.maxTokens = opts.maxTokens ?? 1200;
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

    const res = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: this.maxTokens,
        temperature: 0.2,
        system: QUOTE_ASSISTANT_SYSTEM_PROMPT,
        messages: [{ role: "user", content: userText }],
      }),
    });

    if (!res.ok) {
      throw new Error(`Anthropic API error ${res.status}: ${await res.text()}`);
    }

    const data = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
    const text = data.content?.find((c) => c.type === "text")?.text ?? "";
    const json = extractJson(text) as Record<string, unknown>;
    // Force the source tag regardless of what the model echoes back.
    return quoteDraftSchema.parse({ ...json, source: "claude" });
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
