/**
 * §1.7 Server-side gate — defence in depth.
 *
 * Do NOT trust the model alone. After the AI returns its JSON we run this
 * validator before anything reaches the user. It can only ever ESCALATE risk
 * (§1.1 one-directional ladder) — it never rounds a verdict down.
 *
 * Guarantees enforced here:
 *   1. Any active safety flag (§1.5) forces EMERGENCY_STOP.
 *   2. Any regulated category (§1.4) or regulated domain forces >= NEEDS_LICENSED_PRO.
 *   3. Banned content in diy_guidance forces >= NEEDS_LICENSED_PRO.
 *   4. diy_guidance is stripped whenever the final verdict is not DIY_SAFE.
 *   5. Every override is logged for review — a spike means the prompt is drifting.
 *
 * This guarantees that even a jailbreak or model slip cannot emit illegal DIY
 * instructions.
 */
import {
  maxVerdict,
  type ModelTriage,
  type TriageResult,
  type Verdict,
} from "./schema.js";
import {
  CATEGORY_MAX_VERDICT,
  findBannedContent,
  hasActiveSafetyFlag,
  hasRegulatedDomain,
  isRegulatedCategory,
  TRADE_DEFAULT_LICENCE,
} from "./policy.js";

export type OverrideReason =
  | "safety_flag_forces_emergency_stop"
  | "regulated_category_forces_pro"
  | "regulated_domain_forces_pro"
  | "banned_content_in_diy_guidance"
  | "diy_guidance_stripped_non_diy_verdict"
  | "diy_on_regulated_category_stripped";

export interface Override {
  reason: OverrideReason;
  from_verdict: Verdict;
  to_verdict: Verdict;
  detail: string;
}

export interface GateResult {
  /** The safe, user-facing triage after coercion. */
  triage: TriageResult;
  /** The verdict the model originally returned (pre-gate), for auditing. */
  model_verdict: Verdict;
  /** Every coercion applied, in order. Empty means the model was already safe. */
  overrides: Override[];
}

/**
 * Run the gate over a validated model response.
 *
 * @param triageId  server-assigned id (the model never sets this)
 * @param model     the schema-validated model output
 */
export function runGate(triageId: string, model: ModelTriage): GateResult {
  const overrides: Override[] = [];
  const modelVerdict = model.verdict;
  let verdict: Verdict = model.verdict;
  let diyGuidance = model.diy_guidance;

  const record = (
    reason: OverrideReason,
    to: Verdict,
    detail: string,
  ) => {
    const from = verdict;
    verdict = maxVerdict(verdict, to);
    if (verdict !== from || reason.includes("stripped")) {
      overrides.push({ reason, from_verdict: from, to_verdict: verdict, detail });
    }
  };

  // (1) Safety flags → force EMERGENCY_STOP, overriding everything.
  if (hasActiveSafetyFlag(model.safety_flags)) {
    const active = model.safety_flags.filter((f) => f !== "none");
    record(
      "safety_flag_forces_emergency_stop",
      "EMERGENCY_STOP",
      `active safety flags: ${active.join(", ")}`,
    );
  }

  // (2) Regulated category → at least NEEDS_LICENSED_PRO.
  if (isRegulatedCategory(model.category)) {
    const ceiling = CATEGORY_MAX_VERDICT[model.category]!;
    record(
      "regulated_category_forces_pro",
      ceiling,
      `category '${model.category}' is regulated`,
    );
  }

  // (2b) Regulated domain asserted even if category looked benign.
  if (hasRegulatedDomain(model.regulated_domains)) {
    record(
      "regulated_domain_forces_pro",
      "NEEDS_LICENSED_PRO",
      `regulated_domains: ${model.regulated_domains.join(", ")}`,
    );
  }

  // (3) Banned-content scan of diy_guidance — a jailbreak safety net.
  if (diyGuidance) {
    const texts = [
      ...diyGuidance.steps,
      ...diyGuidance.tools_required,
    ];
    const hits = findBannedContent(texts);
    if (hits.length > 0) {
      record(
        "banned_content_in_diy_guidance",
        "NEEDS_LICENSED_PRO",
        `banned patterns in diy guidance: ${hits.join(", ")}`,
      );
    }
  }

  // (4) Strip diy_guidance whenever the final verdict is not DIY_SAFE.
  if (verdict !== "DIY_SAFE" && diyGuidance !== null) {
    overrides.push({
      reason:
        modelVerdict === "DIY_SAFE"
          ? "diy_on_regulated_category_stripped"
          : "diy_guidance_stripped_non_diy_verdict",
      from_verdict: modelVerdict,
      to_verdict: verdict,
      detail: "diy_guidance removed because final verdict is not DIY_SAFE",
    });
    diyGuidance = null;
  }

  const triage = buildSafeTriage(triageId, model, verdict, diyGuidance);
  return { triage, model_verdict: modelVerdict, overrides };
}

/**
 * Reassemble a coherent, user-safe triage object after coercion. When the gate
 * escalates a verdict we must also backfill the fields the new verdict requires
 * (why_pro_needed, a fallback user_message) so the homeowner never sees a
 * DIY-shaped payload with a pro verdict.
 */
function buildSafeTriage(
  triageId: string,
  model: ModelTriage,
  verdict: Verdict,
  diyGuidance: TriageResult["diy_guidance"],
): TriageResult {
  const escalated = verdict !== model.verdict;

  let whyPro = model.why_pro_needed;
  if (verdict !== "DIY_SAFE" && !whyPro) {
    whyPro =
      "This looks like regulated or hazardous work. By law and for safety it needs " +
      "a licensed tradesperson — we can't provide DIY steps for it.";
  }

  let userMessage = model.user_message;
  if (escalated) {
    userMessage = safeUserMessage(verdict, model, whyPro);
  }

  const requiredLicence =
    model.required_licence_class ??
    TRADE_DEFAULT_LICENCE[model.recommended_trade] ??
    null;

  return {
    triage_id: triageId,
    verdict,
    confidence: model.confidence,
    category: model.category,
    regulated_domains: model.regulated_domains,
    safety_flags: model.safety_flags,
    likely_causes: model.likely_causes,
    recommended_trade: model.recommended_trade,
    required_licence_class: requiredLicence,
    clarifying_questions:
      verdict === "UNCLEAR" ? model.clarifying_questions : [],
    diy_guidance: verdict === "DIY_SAFE" ? diyGuidance : null,
    why_pro_needed: verdict === "DIY_SAFE" ? null : whyPro,
    job_spec: model.job_spec,
    user_message: userMessage,
    disclaimer: model.disclaimer,
  };
}

/** A calm, on-policy fallback message when the gate has overridden the model. */
function safeUserMessage(
  verdict: Verdict,
  model: ModelTriage,
  whyPro: string | null,
): string {
  const trade =
    model.recommended_trade !== "none"
      ? `licensed ${model.recommended_trade.replace("_", " ")}`
      : "licensed tradesperson";

  switch (verdict) {
    case "EMERGENCY_STOP":
      return (
        "Please act on this now: make yourself safe first — if it's safe to do so, " +
        "switch off power at your main switch or leave the area, and call 000 or the " +
        `relevant emergency line if there's any fire, gas or injury risk. When you're ` +
        `safe, I can line up a ${trade} for you.`
      );
    case "NEEDS_LICENSED_PRO":
      return (
        `Here's what's likely going on. This one needs a ${trade} — ${whyPro ?? "it's regulated work and not a DIY job."} ` +
        "I've written up the details so tradies can quote accurately — you'll start seeing private quotes shortly."
      );
    case "UNCLEAR":
      return "I need a little more detail to route this safely — please answer the questions below.";
    default:
      return model.user_message;
  }
}
