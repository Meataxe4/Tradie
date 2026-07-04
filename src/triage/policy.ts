/**
 * §1 AI Triage Safety Policy — the machine-readable rules the server-side gate
 * (§1.7) enforces on top of the model. These are the reason the product is safe
 * to ship; treat them as non-negotiable and change them only with review.
 */
import type { Category, RegulatedDomain, SafetyFlag, Verdict, RecommendedTrade } from "./schema.js";

/**
 * §1.7 category → max_allowed_verdict map.
 *
 * Every regulated category maps to NEEDS_LICENSED_PRO: the gate will never let a
 * job in one of these categories resolve to DIY_SAFE, no matter what the model
 * says. Categories absent from this map have no category-level ceiling (their
 * verdict can still be escalated by safety flags or regulated_domains).
 */
export const CATEGORY_MAX_VERDICT: Partial<Record<Category, Verdict>> = {
  electrical: "NEEDS_LICENSED_PRO",
  gas: "NEEDS_LICENSED_PRO",
  plumbing_water: "NEEDS_LICENSED_PRO",
  hvac: "NEEDS_LICENSED_PRO", // refrigerant work is licensed
  structural: "NEEDS_LICENSED_PRO",
};

/** Regulated domains that force at least NEEDS_LICENSED_PRO when present. */
export const REGULATED_DOMAIN_SET: ReadonlySet<RegulatedDomain> = new Set([
  "electrical",
  "gas",
  "plumbing_water",
]);

/**
 * §1.3 DIY-safe allowlist. DIY_SAFE is permitted ONLY for these scenario tags;
 * anything else is not DIY-safe by default. The model is asked to classify into
 * one of these, and the gate uses them to decide whether banned-content in the
 * guidance is a genuine violation vs. an expected mention.
 *
 * (Kept as an explicit enumerated list so it reads exactly like the spec.)
 */
export const DIY_ALLOWLIST = [
  "flatpack_or_furniture_assembly",
  "mounting_shelf_tv_picture",
  "reset_tripped_switch_once",
  "swap_plugin_appliance_or_globe_or_battery",
  "plunge_or_clear_drain_opening",
  "resilicone_cosmetic_bead",
  "free_sticking_door_hinge_drawer",
  "clear_ground_level_gutter",
  "device_battery_or_reset_per_manual",
] as const;
export type DiyAllowlistTag = (typeof DIY_ALLOWLIST)[number];

/**
 * §1.7 banned-content keywords for the lightweight scan of diy_guidance text.
 * These are phrases that must never appear in DIY instructions we hand to a
 * homeowner because they imply regulated electrical / gas / plumbing work.
 *
 * Matched case-insensitively on word boundaries to limit false positives
 * (e.g. "gas" won't match "gasket"). This is a safety net behind the category
 * and flag checks, not the primary defence.
 */
export const BANNED_GUIDANCE_PATTERNS: readonly RegExp[] = [
  /\bwir(?:e|es|ing)\b/i,
  /\brewir\w*\b/i,
  /\bgas\b/i,
  /\bcircuit\b/i,
  /\bswitchboard\b/i,
  /\bfuse\b/i,
  /\bvolts?\b/i,
  /\bamps?\b/i,
  /\bisolate the main\w*\b/i,
  /\bcut the pipe\b/i,
  /\bsolder\b/i,
  /\bcap(?:ping)? the (?:pipe|line)\b/i,
  /\brefrigerant\b/i,
  /\basbestos\b/i,
];

/** Map a required trade → a human-readable licence-class hint for matching (§7). */
export const TRADE_DEFAULT_LICENCE: Record<RecommendedTrade, string | null> = {
  electrician: "Unrestricted electrical licence",
  plumber: "Plumbing contractor licence",
  gasfitter: "Gasfitting licence",
  hvac_tech: "Refrigerant handling licence (ARC RHL)",
  builder: "Builder / relevant trade licence",
  handyman: null,
  locksmith: null,
  none: null,
};

/** Is this category regulated at the category level? */
export function isRegulatedCategory(category: Category): boolean {
  return category in CATEGORY_MAX_VERDICT;
}

/** Does the regulated_domains list assert a regulated domain (anything but ["none"])? */
export function hasRegulatedDomain(domains: readonly RegulatedDomain[]): boolean {
  return domains.some((d) => REGULATED_DOMAIN_SET.has(d));
}

/** Are any real safety flags set (anything other than ["none"])? */
export function hasActiveSafetyFlag(flags: readonly SafetyFlag[]): boolean {
  return flags.some((f) => f !== "none");
}

/** Return the banned patterns that match any of the supplied guidance strings. */
export function findBannedContent(texts: readonly string[]): string[] {
  const hits: string[] = [];
  for (const pattern of BANNED_GUIDANCE_PATTERNS) {
    if (texts.some((t) => pattern.test(t))) hits.push(pattern.source);
  }
  return hits;
}
