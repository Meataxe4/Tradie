/**
 * Picks the triage LLM client: real Claude when ANTHROPIC_API_KEY is set,
 * otherwise the deterministic mock so the app runs fully offline.
 */
import type { TriageLlmClient } from "./triage/llmClient.js";
import { MockTriageClient } from "./triage/llmClient.js";
import { AnthropicTriageClient } from "./triage/anthropicClient.js";
import type { QuoteAssistantClient } from "./quoting/quoteAssistant.js";
import { MockQuoteAssistantClient } from "./quoting/quoteAssistant.js";
import { AnthropicQuoteAssistantClient } from "./quoting/anthropicQuoteClient.js";

export function createLlmClient(): { client: TriageLlmClient; kind: "anthropic" | "mock" } {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (apiKey) {
    return {
      client: new AnthropicTriageClient({
        apiKey,
        model: process.env.TRIAGE_MODEL,
      }),
      kind: "anthropic",
    };
  }
  return { client: new MockTriageClient(), kind: "mock" };
}

/** The AI Quote Assistant client — real Claude when a key is set, else the mock. */
export function createQuoteAssistant(): { client: QuoteAssistantClient; kind: "anthropic" | "mock" } {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (apiKey) {
    return {
      client: new AnthropicQuoteAssistantClient({
        apiKey,
        model: process.env.QUOTE_MODEL ?? process.env.TRIAGE_MODEL,
      }),
      kind: "anthropic",
    };
  }
  return { client: new MockQuoteAssistantClient(), kind: "mock" };
}
