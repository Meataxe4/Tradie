/**
 * §2 AI triage output schema.
 *
 * This is the single object the AI must return (and nothing else). It powers
 * both the homeowner view and the tradie job post. We validate it at runtime
 * with zod so a malformed / hallucinated model response is rejected before it
 * ever reaches the safety gate or a user.
 */
import { z } from "zod";

export const VERDICTS = [
  "DIY_SAFE",
  "NEEDS_LICENSED_PRO",
  "EMERGENCY_STOP",
  "UNCLEAR",
] as const;
export type Verdict = (typeof VERDICTS)[number];

export const CATEGORIES = [
  "electrical",
  "plumbing_water",
  "gas",
  "hvac",
  "structural",
  "carpentry",
  "appliance",
  "locksmith",
  "handyman",
  "other",
] as const;
export type Category = (typeof CATEGORIES)[number];

export const REGULATED_DOMAINS = [
  "electrical",
  "gas",
  "plumbing_water",
  "none",
] as const;
export type RegulatedDomain = (typeof REGULATED_DOMAINS)[number];

export const SAFETY_FLAGS = [
  "gas_odour",
  "electrical_hazard",
  "water_and_electrical",
  "fire_risk",
  "flooding",
  "asbestos_suspected",
  "none",
] as const;
export type SafetyFlag = (typeof SAFETY_FLAGS)[number];

export const RECOMMENDED_TRADES = [
  "electrician",
  "plumber",
  "gasfitter",
  "hvac_tech",
  "builder",
  "handyman",
  "locksmith",
  "none",
] as const;
export type RecommendedTrade = (typeof RECOMMENDED_TRADES)[number];

const likelihood = z.enum(["low", "medium", "high"]);

export const diyGuidanceSchema = z.object({
  steps: z.array(z.string()).min(1),
  tools_required: z.array(z.string()),
  stop_conditions: z.array(z.string()).min(1),
});
export type DiyGuidance = z.infer<typeof diyGuidanceSchema>;

export const jobSpecSchema = z.object({
  title: z.string().min(1),
  summary: z.string().min(1),
  symptoms: z.array(z.string()),
  access_notes: z.string(),
  questions_for_site_visit: z.array(z.string()),
  urgency: z.enum(["emergency", "urgent", "routine"]),
  photos_attached: z.boolean(),
});
export type JobSpec = z.infer<typeof jobSpecSchema>;

/**
 * The full triage object. `triage_id` is assigned by our service, so the model
 * response schema (below) omits it and we merge it in.
 */
export const triageResultSchema = z.object({
  triage_id: z.string().uuid(),
  verdict: z.enum(VERDICTS),
  confidence: z.enum(["low", "medium", "high"]),
  category: z.enum(CATEGORIES),
  regulated_domains: z.array(z.enum(REGULATED_DOMAINS)).min(1),
  safety_flags: z.array(z.enum(SAFETY_FLAGS)).min(1),
  likely_causes: z.array(
    z.object({ cause: z.string(), likelihood }),
  ),
  recommended_trade: z.enum(RECOMMENDED_TRADES),
  required_licence_class: z.string().nullable(),
  clarifying_questions: z.array(z.string()),
  diy_guidance: diyGuidanceSchema.nullable(),
  why_pro_needed: z.string().nullable(),
  job_spec: jobSpecSchema.nullable(),
  user_message: z.string().min(1),
  disclaimer: z.string().min(1),
});
export type TriageResult = z.infer<typeof triageResultSchema>;

/** What the model returns — same shape without the server-assigned id. */
export const modelTriageSchema = triageResultSchema.omit({ triage_id: true });
export type ModelTriage = z.infer<typeof modelTriageSchema>;

/** Rank verdicts on the §1.1 one-directional escalation ladder. Higher = riskier. */
export const VERDICT_RANK: Record<Verdict, number> = {
  DIY_SAFE: 0,
  UNCLEAR: 1,
  NEEDS_LICENSED_PRO: 2,
  EMERGENCY_STOP: 3,
};

/** Return the riskier (higher-ranked) of two verdicts. Escalation only. */
export function maxVerdict(a: Verdict, b: Verdict): Verdict {
  return VERDICT_RANK[a] >= VERDICT_RANK[b] ? a : b;
}
