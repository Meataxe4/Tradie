/**
 * §1.7 / §11 The triage pipeline: job → AI → gate → persist.
 *
 * Fail-closed principle: if the model errors or returns something unparseable,
 * we do NOT surface a DIY answer — we synthesise a safe NEEDS_LICENSED_PRO
 * result and record the failure. Uncertainty always escalates (§1.1).
 */
import { v4 as uuidv4 } from "uuid";
import { runGate, type GateResult } from "./gate.js";
import type { TriageLlmClient, TriageInput } from "./llmClient.js";
import { GENERAL_DISCLAIMER } from "./systemPrompt.js";
import type { ModelTriage, TriageResult } from "./schema.js";

export type Clock = () => string;
const systemClock: Clock = () => new Date().toISOString();

export interface TriageServiceDeps {
  llm: TriageLlmClient;
  clock?: Clock;
}

/**
 * A transparent record of what happened with any attached photos. It rides
 * ALONGSIDE the gated triage result (never inside it), so the safety gate is
 * completely unaffected by vision.
 *   - mode "live":    real photos were analysed by a vision-capable model
 *   - mode "preview": photos were attached but only their captions were read
 *                     (offline mock) — the UI says so, never implying vision
 *   - mode "none":    no photos
 */
export interface VisionSummary {
  photos: number;
  captions: number;
  analyzed: boolean;
  mode: "live" | "preview" | "none";
}

export interface TriageOutcome {
  gate: GateResult;
  failedClosed: boolean;
  vision: VisionSummary;
}

export class TriageService {
  private readonly llm: TriageLlmClient;
  private readonly clock: Clock;

  constructor(deps: TriageServiceDeps) {
    this.llm = deps.llm;
    this.clock = deps.clock ?? systemClock;
  }

  private visionSummary(input: TriageInput): VisionSummary {
    const photos = input.images?.length ?? input.photoCount ?? 0;
    const captions = (input.captions ?? []).filter((c) => c && c.trim()).length;
    const analyzed = (input.images?.length ?? 0) > 0 && this.llm.supportsVision === true;
    const mode: VisionSummary["mode"] = photos > 0 ? (analyzed ? "live" : "preview") : "none";
    return { photos, captions, analyzed, mode };
  }

  async triage(input: TriageInput): Promise<TriageOutcome> {
    const triageId = uuidv4();
    const vision = this.visionSummary(input);
    let model: ModelTriage;
    try {
      model = await this.llm.classify(input);
    } catch (err) {
      // Fail closed — never DIY on an error.
      return {
        gate: {
          triage: this.failClosedResult(triageId, input, String(err)),
          model_verdict: "NEEDS_LICENSED_PRO",
          overrides: [
            {
              reason: "regulated_domain_forces_pro",
              from_verdict: "UNCLEAR",
              to_verdict: "NEEDS_LICENSED_PRO",
              detail: `triage model failure, failing closed: ${String(err)}`,
            },
          ],
        },
        failedClosed: true,
        vision,
      };
    }

    const gate = runGate(triageId, model);
    return { gate, failedClosed: false, vision };
  }

  private failClosedResult(
    triageId: string,
    input: TriageInput,
    reason: string,
  ): TriageResult {
    return {
      triage_id: triageId,
      verdict: "NEEDS_LICENSED_PRO",
      confidence: "low",
      category: "other",
      regulated_domains: ["none"],
      safety_flags: ["none"],
      likely_causes: [],
      recommended_trade: "none",
      required_licence_class: null,
      clarifying_questions: [],
      diy_guidance: null,
      why_pro_needed:
        "We couldn't automatically assess this safely, so to be safe we're routing it " +
        "to a licensed tradesperson rather than suggesting any DIY steps.",
      job_spec: {
        title: "Home repair — needs assessment",
        summary: input.description.slice(0, 500),
        symptoms: [],
        access_notes: "",
        questions_for_site_visit: [],
        urgency: "routine",
        photos_attached: input.photoCount > 0,
      },
      user_message:
        "Thanks — to be safe we're routing this to a licensed tradesperson. You'll " +
        "start seeing private quotes shortly.",
      disclaimer: GENERAL_DISCLAIMER,
    };
  }
}
