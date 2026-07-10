/**
 * Price book — common, well-scoped jobs that get an INSTANT firm, GST-inclusive
 * quote at triage time (no site visit needed). Anything not matched here is
 * routed to the assigned trade as a custom quote request.
 *
 * Amounts are AUD cents, GST-inclusive. Seeded from typical Inner West ranges;
 * in production these come from foundation-trade input per §5 / risk #2.
 */
import type { Category } from "../triage/schema.js";

export interface PriceBookItem {
  key: string;
  label: string;
  amount: number; // AUD cents, GST-inclusive
}

interface Entry extends PriceBookItem {
  match: (text: string) => boolean;
}

const BOOK: Partial<Record<Category, Entry[]>> = {
  electrical: [
    { key: "ep_powerpoint", label: "Replace or repair a single power point", amount: 18500, match: (t) => /power ?point|\bgpo\b|power outlet|\boutlet\b/.test(t) },
    { key: "ep_downlight", label: "Replace a faulty downlight", amount: 16000, match: (t) => /downlight/.test(t) },
    { key: "ep_switch", label: "Replace a light switch", amount: 15000, match: (t) => /light switch|\bswitch\b/.test(t) },
    { key: "ep_fan", label: "Repair a ceiling fan", amount: 22000, match: (t) => /ceiling fan/.test(t) },
  ],
  plumbing_water: [
    { key: "pl_mixer", label: "Replace a mixer tap", amount: 28000, match: (t) => /mixer|\btap\b/.test(t) },
    { key: "pl_cistern", label: "Repair a toilet cistern", amount: 24000, match: (t) => /cistern|toilet/.test(t) },
  ],
  carpentry: [
    { key: "cp_rehang", label: "Rehang or realign an internal door", amount: 18000, match: (t) => /door|hinge/.test(t) },
  ],
};

/** Return a firm price-book item if this job is a known common job, else null. */
export function priceBookLookup(category: Category, text: string): PriceBookItem | null {
  const list = BOOK[category];
  if (!list) return null;
  const t = text.toLowerCase();
  const hit = list.find((e) => e.match(t));
  return hit ? { key: hit.key, label: hit.label, amount: hit.amount } : null;
}
