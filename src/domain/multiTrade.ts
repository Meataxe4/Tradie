/**
 * Concept-stage: multi-trade jobs. Infers when one problem spans trades and
 * plans a scoped, correctly-sequenced sub-job per trade. The customer keeps one
 * flow (a project view, per-stage prices, one payment relationship) while each
 * trade sees only a clean single-trade job.
 *
 * This is an INFERENCE engine, not a phrase list: it detects the trade domains
 * a description touches, adds the follow-on trades a problem implies even when
 * unstated (water into building fabric means someone must repair and repaint
 * what got wet), and orders stages cause → structure → finish. The live model
 * (M1) replaces this heuristic with genuine reasoning through the same seam.
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

// ---- signal groups ---------------------------------------------------------
const WATER_CAUSE =
  /(leak|leaking|leaked|drip|dripping|burst|flood|flooded|flooding|overflow(ing)?|water damage|damp|moisture|wet (patch|spot|mark)|water (is )?(coming|getting|pouring|running))/i;
// Building fabric: water reaching any of these implies repair + refinish work.
const FABRIC =
  /(roof|ceiling|wall|floor(board)?s?|plasterboard|gyprock|cornice|skirting|timber|joist|eaves|cabinetry|cupboard)/i;
const ELECTRICAL =
  /(power ?point|outlet|gpo|light switch|downlight|light fitting|wiring|electrical|electric(?! hot water)|fuse|switchboard|ceiling fan|new (light|power))/i;
const GAS = /\bgas\b/i;
const CARPENTRY =
  /(plasterboard|gyprock|stud|joist|door frame|floorboard|deck|cornice|skirting|rotted|rotten|sagging|hole in the (wall|ceiling)|carpent)/i;
const PAINT = /\b(paint|repaint|painting|repainting)\b/i;
const TILING = /(re-?tile|tiles?|tiling|grout)/i;
const HVAC = /(air ?con|air conditioning|ducted|split system)/i;
const PLUMBING_FIXTURE = /(tap|mixer|toilet|cistern|sink|basin|shower|drain|pipe|hot water|plumb)/i;
const RENO = /(renovat|remodel|refit|new (kitchen|bathroom|laundry|ensuite))/i;

function waterLocation(text: string): string {
  if (/roof/i.test(text)) return "roof";
  if (/ceiling/i.test(text)) return "ceiling";
  if (/wall/i.test(text)) return "wall";
  if (/floor/i.test(text)) return "floor";
  return "affected area";
}

/** Infer a multi-trade plan from any phrasing, else null (single-trade job). */
export function detectMultiTradePlan(description: string): MultiTradePlan | null {
  const t = description;

  // Special case with known stages: hot-water system replacement (plumber + electrician).
  if (/replace.{0,30}(electric )?hot water (system|service|heater)|hot water (system|service|heater).{0,30}replace/i.test(t)) {
    return {
      title: "Hot water system replacement",
      stages: [
        { category: "plumbing_water", label: "Swap the unit", description: "Disconnect the old hot water system and install the replacement unit" },
        { category: "electrical", label: "Reconnect power", description: "A power point and fixed wiring connection for the new hot water system needs a licensed electrician" },
      ],
    };
  }

  // Implication rule: water reaching building fabric means three trades even if
  // the customer only mentioned the leak — stop it, repair what got wet, refinish.
  if (WATER_CAUSE.test(t) && FABRIC.test(t)) {
    const loc = waterLocation(t);
    return {
      title: `Water leak (${loc}) — find, fix and make good`,
      stages: [
        { category: "plumbing_water", label: "Stop the leak", description: `Find and repair the source of the water getting into the ${loc}` },
        { category: "carpentry", label: "Repair the damage", description: `Replace the water-damaged ${loc === "floor" ? "flooring" : "plasterboard"} once the ${loc} is dry` },
        { category: "handyman", label: "Patch & paint", description: `Patch, sand and repaint the repaired ${loc} section` },
      ],
    };
  }

  // General rule: count the distinct trade domains the description touches.
  // Two or more → one project, staged in dependency order (cause → structure → finish).
  const reno = RENO.test(t);
  const domains: Array<{ category: Category; label: string; description: string }> = [];
  if (GAS.test(t)) domains.push({ category: "gas", label: "Gas work", description: "Gas supply or appliance work — licensed gasfitter required" });
  if (WATER_CAUSE.test(t) || PLUMBING_FIXTURE.test(t)) domains.push({ category: "plumbing_water", label: "Plumbing", description: "Water-connected plumbing work — licensed plumber required" });
  if (ELECTRICAL.test(t)) domains.push({ category: "electrical", label: "Electrical", description: "Fixed wiring or fittings — licensed electrician required" });
  if (HVAC.test(t)) domains.push({ category: "hvac", label: "Heating & cooling", description: "Air-conditioning work — licensed technician required" });
  if (CARPENTRY.test(t) || reno) domains.push({ category: "carpentry", label: "Carpentry & structure", description: "Framing, sheeting or structural carpentry work" });
  if (TILING.test(t)) domains.push({ category: "handyman", label: "Tiling", description: "Tiling and grouting for the affected area" });
  if (PAINT.test(t)) domains.push({ category: "handyman", label: "Patch & paint", description: "Patch, sand and paint to finish" });

  // Dedup by category, keeping first (dependency-ordered above).
  const seen = new Set<string>();
  const stages = domains.filter((d) => (seen.has(d.category) ? false : (seen.add(d.category), true)));
  if (stages.length >= 2) {
    return {
      title: reno ? "Renovation — trades sequenced" : "Multi-trade job — sequenced",
      stages: stages.map((s) => ({ category: s.category, label: s.label, description: s.description })),
    };
  }
  return null;
}
