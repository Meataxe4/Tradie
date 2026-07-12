/**
 * Concept-stage: multi-trade jobs. Detects when one problem spans trades and
 * plans a scoped, correctly-sequenced sub-job per trade. The customer keeps one
 * flow (a project view, per-stage prices, one payment relationship) while each
 * trade sees only a clean single-trade job.
 *
 * Safety posture: decomposition NEVER touches verdicts. The full description is
 * triaged first; a plan is only applied when that verdict is NEEDS_LICENSED_PRO
 * (never on EMERGENCY_STOP, UNCLEAR or DIY), and every stage job then runs the
 * complete triage + gate pipeline itself. Sequencing is platform-owned.
 */
import type { Category } from "../triage/schema.js";

export interface StagePlan {
  category: Category;
  label: string;
  description: string;
}

export interface MultiTradePlan {
  title: string;
  stages: StagePlan[];
}

interface Pattern {
  match: RegExp;
  plan: MultiTradePlan;
}

const PATTERNS: Pattern[] = [
  {
    // The brief's canonical case: a ceiling leak needs plumber → carpenter → painter.
    match: /(ceiling|roof).{0,40}(leak|water (stain|damage|dripping))|(leak|water).{0,40}(through|from|in) the (ceiling|roof)|water stain on the ceiling/i,
    plan: {
      title: "Ceiling leak — find, fix and make good",
      stages: [
        { category: "plumbing_water", label: "Stop the leak", description: "Find and repair the leaking pipe above the ceiling" },
        { category: "carpentry", label: "Repair the ceiling", description: "Replace the water-damaged plasterboard ceiling section" },
        { category: "handyman", label: "Patch & paint", description: "Patch, sand and repaint the repaired ceiling section" },
      ],
    },
  },
  {
    // Second common span: a hot-water system replacement needing plumber + electrician.
    match: /replace.{0,30}(electric )?hot water (system|service|heater)|hot water (system|service|heater).{0,30}replace/i,
    plan: {
      title: "Hot water system replacement",
      stages: [
        { category: "plumbing_water", label: "Swap the unit", description: "Disconnect the old hot water system and install the replacement unit" },
        { category: "electrical", label: "Reconnect power", description: "A power point and fixed wiring connection for the new hot water system needs a licensed electrician" },
      ],
    },
  },
];

/** Return a multi-trade plan when the description matches a known span, else null. */
export function detectMultiTradePlan(description: string): MultiTradePlan | null {
  const hit = PATTERNS.find((p) => p.match.test(description));
  return hit ? hit.plan : null;
}
