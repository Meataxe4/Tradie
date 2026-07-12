/**
 * Real Claude-backed triage client. Only used when ANTHROPIC_API_KEY is set;
 * otherwise the app falls back to MockTriageClient so it runs fully offline.
 *
 * Uses fetch directly to avoid a hard SDK dependency. Temperature is kept low
 * (§3) and the response is parsed + schema-validated before it leaves here — a
 * malformed response throws and the pipeline treats it as a triage failure
 * (fail closed to NEEDS_LICENSED_PRO at the service layer).
 */
import {
  modelTriageSchema,
  type ModelTriage,
} from "./schema.js";
import { TRIAGE_SYSTEM_PROMPT } from "./systemPrompt.js";
import type { TriageInput, TriageLlmClient } from "./llmClient.js";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

export interface AnthropicClientOptions {
  apiKey: string;
  /** Product config — a current, capable Claude model id. */
  model?: string;
  maxTokens?: number;
}

export class AnthropicTriageClient implements TriageLlmClient {
  readonly supportsVision = true;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly maxTokens: number;

  constructor(opts: AnthropicClientOptions) {
    this.apiKey = opts.apiKey;
    this.model = opts.model ?? "claude-sonnet-5";
    this.maxTokens = opts.maxTokens ?? 1500;
  }

  async classify(input: TriageInput): Promise<ModelTriage> {
    const images = input.images ?? [];
    const captions = (input.captions ?? []).filter((c) => c && c.trim());
    const userText =
      `Homeowner problem description:\n${input.description}\n\n` +
      (captions.length ? `Photo notes from the homeowner:\n- ${captions.join("\n- ")}\n\n` : "") +
      `Photos attached: ${images.length || input.photoCount}\n` +
      (input.suburb ? `Suburb: ${input.suburb}\n` : "") +
      (images.length
        ? "\nThe attached photos are evidence. Use them to spot hazards — scorching, " +
          "smoke damage, melted or exposed wiring, water near electrical, corrosion, " +
          "structural cracks. If a photo shows danger, ESCALATE. A photo can mislead, " +
          "so never use one to downgrade risk or justify DIY.\n"
        : "") +
      `\nReturn ONLY the JSON triage object.`;

    // Multimodal content: the text block plus one image block per photo.
    const content: unknown[] = [{ type: "text", text: userText }];
    for (const im of images) {
      content.push({ type: "image", source: { type: "base64", media_type: im.media_type, data: im.data } });
    }

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
        temperature: 0.1,
        system: TRIAGE_SYSTEM_PROMPT,
        messages: [{ role: "user", content }],
      }),
    });

    if (!res.ok) {
      throw new Error(`Anthropic API error ${res.status}: ${await res.text()}`);
    }

    const data = (await res.json()) as {
      content?: Array<{ type: string; text?: string }>;
    };
    const text = data.content?.find((c) => c.type === "text")?.text ?? "";
    const json = extractJson(text);
    return modelTriageSchema.parse(json);
  }
}

/** Pull the first top-level JSON object out of a model response. */
function extractJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("No JSON object found in model response");
  }
  return JSON.parse(text.slice(start, end + 1));
}
