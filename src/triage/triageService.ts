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

export interface TriageOutcome {
  gate: GateResult;
  failedClosed: boolean;
}

export class TriageService {
  private readonly llm: TriageLlmClient;
  private readonly clock: Clock;

  constructor(deps: TriageServiceDeps) {
    this.llm = deps.llm;
    this.clock = deps.clock ?? systemClock;
  }

  async triage(input: TriageInput): Promise<TriageOutcome> {
    const triageId = uuidv4();
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
      };
    }

    const gate = runGate(triageId, model);
    return { gate, failedClosed: false };
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
