/**
 * Concept-stage: standards & certification layer, grounded in real NSW
 * obligations (brief §8). The platform knows which job types legally require a
 * compliance certificate, prompts the trade to lodge and attach it at
 * completion, stores it on the job record, and flags jobs missing one.
 * Trades without a certificate regime fall back to Home Building Act statutory
 * warranties — surfaced so the customer still sees what protects them.
 */
import type { Category } from "../triage/schema.js";

export interface CertificateRequirement {
  /** The certificate the trade must lodge for this category of work. */
  name: string;
  /** The legal lodgement window, shown to the trade as the deadline. */
  window: string;
}

const REQUIREMENTS: Partial<Record<Category, CertificateRequirement>> = {
  electrical: { name: "Certificate of Compliance (CCEW)", window: "within 7 days of completion" },
  gas: { name: "Gas compliance certificate", window: "within 5 business days" },
  plumbing_water: { name: "Plumbing Certificate of Compliance", window: "on completion" },
  hvac: { name: "Electrical/refrigerant compliance certificate", window: "within 7 days of completion" },
};

/** The certificate this category legally requires, or null (statutory warranties apply). */
export function certificateRequirement(category: Category): CertificateRequirement | null {
  return REQUIREMENTS[category] ?? null;
}
