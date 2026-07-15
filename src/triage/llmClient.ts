/**
 * LLM client abstraction. The triage pipeline depends only on this interface,
 * so the safety gate is fully testable offline and the real model can be
 * swapped in without touching the gate.
 *
 * Two implementations:
 *   - MockTriageClient    deterministic, keyword-driven; used by tests and by
 *                         default when no ANTHROPIC_API_KEY is configured.
 *   - AnthropicTriageClient  real Claude call (see anthropicClient.ts).
 */
import { v4 as uuidv4 } from "uuid";
import {
  modelTriageSchema,
  type ModelTriage,
} from "./schema.js";
import { GENERAL_DISCLAIMER, DIY_DISCLAIMER } from "./systemPrompt.js";

/** A photo attached to a job, ready for a multimodal model (base64, no prefix). */
export interface TriageImage {
  media_type: string; // e.g. "image/jpeg"
  data: string; // base64-encoded bytes
}

export interface TriageInput {
  description: string;
  photoCount: number;
  suburb?: string;
  category_hint?: string;
  /** Actual image bytes for vision-capable clients. */
  images?: TriageImage[];
  /** Homeowner's short note per photo ("what does this show?"). Always analysed. */
  captions?: string[];
  /** Ask-once profile context, e.g. "house built pre-1990" (asbestos era). */
  property_context?: string;
}

export interface TriageLlmClient {
  /** True only when this client can actually see attached photos. */
  readonly supportsVision?: boolean;
  /** Return the raw model triage (pre-gate, without triage_id). */
  classify(input: TriageInput): Promise<ModelTriage>;
}

/**
 * Combine the description with any photo captions into the text the classifier
 * reasons over. Captions are real, homeowner-supplied signal (e.g. "burning
 * smell near this outlet"), so they must be able to ESCALATE risk just like the
 * description — the gate then enforces the ceiling. This is how the offline mock
 * stays honestly "photo-aware": it reads what you tell it about the photo, while
 * a vision-capable client additionally sees the pixels.
 */
export function triageText(input: TriageInput): string {
  return [input.description, ...(input.captions ?? []), input.property_context ?? ""]
    .filter((s) => s && s.trim())
    .join(". ");
}

/**
 * Deterministic mock that mimics a well-behaved model. It intentionally does
 * NOT enforce the safety policy itself in a couple of cases (e.g. it will
 * cheerfully return DIY guidance for a regulated job when the description is
 * ambiguous) so that gate tests can prove the gate catches model slips.
 *
 * It cannot see pixels, so it is NOT vision-capable — but it does read photo
 * captions (see triageText), so a caption describing a hazard still escalates.
 */
export class MockTriageClient implements TriageLlmClient {
  readonly supportsVision = false;

  async classify(input: TriageInput): Promise<ModelTriage> {
    return modelTriageSchema.parse(this.build(input));
  }

  private build(input: TriageInput): ModelTriage {
    const t = triageText(input).toLowerCase();
    const has = (...words: string[]) => words.some((w) => t.includes(w));

    // --- EMERGENCY: gas smell ---
    if (has("gas smell", "smell gas", "smell of gas", "gas leak")) {
      return emergency({
        category: "gas",
        regulated_domains: ["gas"],
        safety_flags: ["gas_odour"],
        recommended_trade: "gasfitter",
        title: "Suspected gas leak",
        summary: "Homeowner reports a gas smell in the property.",
        symptoms: ["Smell of gas"],
        userMessage:
          "Please act on this now: leave the area, don't operate any switches or " +
          "flames, and call the gas emergency line on 1800 GAS LEAK (1800 427 532). " +
          "Evacuate if the smell is strong. When you're safe, I can line up a licensed " +
          "gasfitter for you.",
        photoCount: input.photoCount,
      });
    }

    // --- EMERGENCY: burning smell / smoke / sparks ---
    if (has("burning smell", "smoke", "sparks", "sparking", "scorch", "buzzing outlet", "hot outlet")) {
      return emergency({
        category: "electrical",
        regulated_domains: ["electrical"],
        safety_flags: ["fire_risk", "electrical_hazard"],
        recommended_trade: "electrician",
        title: "Burning smell / sparking from electrical fitting",
        summary: "Possible electrical fault presenting a fire risk.",
        symptoms: ["Burning smell", "Possible sparking or scorching"],
        userMessage:
          "Please act on this now: if it's safe to reach, switch the power off at your " +
          "main switch, and if you see smoke or flames call 000. Do not keep using that " +
          "circuit. Once you're safe, I can line up a licensed electrician for you.",
        photoCount: input.photoCount,
      });
    }

    // --- EMERGENCY: water near electrical ---
    if (has("water near", "wet meter", "water in the meter", "water coming through the light", "water and power")) {
      return emergency({
        category: "electrical",
        regulated_domains: ["electrical"],
        safety_flags: ["water_and_electrical"],
        recommended_trade: "electrician",
        title: "Water near electrical fittings",
        summary: "Water is present near electrical fittings — shock/fire risk.",
        symptoms: ["Water near meter box / outlets / ceiling light"],
        userMessage:
          "Please don't touch anything electrical. If it's safe to reach, switch the " +
          "power off at your main switch, then get a licensed electrician. When you're " +
          "safe, I can line one up for you.",
        photoCount: input.photoCount,
      });
    }

    // --- PRO: dead power point / fixed wiring (this is example B from the spec) ---
    if (has("power point", "powerpoint", "power outlet", "outlet", "gpo", "light switch", "downlight", "ceiling fan")) {
      const fitting = has("ceiling fan")
        ? "ceiling fan"
        : has("downlight")
          ? "downlight"
          : has("light switch") || has("switch")
            ? "light switch"
            : "power point";
      return needsPro({
        category: "electrical",
        regulated_domains: ["electrical"],
        recommended_trade: "electrician",
        licence: "Unrestricted electrical licence",
        why:
          "Power points and fixed fittings connect to fixed wiring. In Australia this is " +
          "licensed electrical work — it's illegal and unsafe to DIY.",
        title: `Faulty ${fitting}`,
        summary: `A ${fitting} has stopped working and needs a licensed electrician to fault-find and repair.`,
        symptoms: [`${fitting.charAt(0).toUpperCase() + fitting.slice(1)} not working`],
        questions: [
          "Are other outlets on the same wall affected?",
          "Has the safety switch tripped?",
        ],
        userMessage:
          "The fitting's likely a wiring or connection fault. This one needs a licensed " +
          "electrician — I've written up the details so you'll get accurate private " +
          "quotes shortly.",
        photoCount: input.photoCount,
      });
    }

    // --- PRO: gas appliance ---
    if (has("gas hot water", "gas cooktop", "gas heater", "gas appliance")) {
      return needsPro({
        category: "gas",
        regulated_domains: ["gas"],
        recommended_trade: "gasfitter",
        licence: "Gasfitting licence",
        why: "Gas work is licensed in Australia — it must be done by a licensed gasfitter.",
        title: "Gas appliance fault",
        summary: "A gas appliance needs a licensed gasfitter to inspect and repair.",
        symptoms: ["Gas appliance not operating correctly"],
        questions: ["Is the pilot light staying lit?", "When was it last serviced?"],
        userMessage:
          "This needs a licensed gasfitter — gas work isn't a DIY job. I've written up " +
          "the details so you'll get accurate private quotes shortly.",
        photoCount: input.photoCount,
      });
    }

    // --- PRO: burst / leaking water pipe, tap/mixer, cistern, hot water ---
    if (has("burst pipe", "leaking pipe", "pipe leak", "ceiling leak", "leaking through the ceiling", "leak in the ceiling", "water stain on the ceiling", "tap replace", "mixer", "cistern", "hot water system", "no hot water", "blocked drain machine")) {
      return needsPro({
        category: "plumbing_water",
        regulated_domains: ["plumbing_water"],
        recommended_trade: "plumber",
        licence: "Plumbing contractor licence",
        why: "Water/sewer-connected plumbing is licensed work — it needs a licensed plumber.",
        title: "Water-connected plumbing fault",
        summary: "A water/sewer-connected plumbing issue needs a licensed plumber.",
        symptoms: ["Leak or fault on water-connected plumbing"],
        questions: ["Have you turned off the water at the mains?", "Is water still flowing?"],
        userMessage:
          "This needs a licensed plumber — water-connected plumbing isn't a DIY job. " +
          "I've written up the details so you'll get accurate private quotes shortly.",
        photoCount: input.photoCount,
      });
    }

    // --- PRO: fixed appliance repair (non-regulated, no licence class required) ---
    if (has("oven", "dishwasher", "washing machine", "clothes dryer", "rangehood", "range hood", "electric cooktop")) {
      return needsPro({
        category: "appliance",
        regulated_domains: ["none"],
        recommended_trade: "handyman",
        licence: null,
        why: "This is a fixed appliance repair — best handled by a qualified appliance technician.",
        title: "Appliance repair",
        summary: "A household appliance has stopped working correctly.",
        symptoms: ["Appliance not operating as expected"],
        questions: ["What's the make and model?", "Is it getting power at all?"],
        userMessage:
          "This looks like an appliance repair. I've written up the details so qualified " +
          "technicians can send you private quotes shortly.",
        photoCount: input.photoCount,
      });
    }

    // --- PRO: suspected asbestos ---
    if (has("asbestos", "fibro", "popcorn ceiling", "textured ceiling")) {
      return needsPro({
        category: "structural",
        regulated_domains: ["none"],
        safety_flags: ["asbestos_suspected"],
        recommended_trade: "builder",
        licence: "Licensed asbestos removalist",
        why:
          "This may contain asbestos. It must never be disturbed — it needs a licensed " +
          "asbestos removalist or occupational hygienist.",
        title: "Suspected asbestos-containing material",
        summary: "Material suspected to contain asbestos; must not be disturbed.",
        symptoms: ["Possible asbestos-containing material present"],
        questions: ["Roughly what year was the home built?", "Is the material damaged or intact?"],
        userMessage:
          "Please don't disturb, sand, drill or break this material. It may contain " +
          "asbestos and needs a licensed removalist. I've written up the details so " +
          "you'll get accurate private quotes shortly.",
        photoCount: input.photoCount,
      });
    }

    // --- PRO: asbestos-era property + work disturbing the building fabric ---
    // Ask-once property context can only ESCALATE (the gate still applies after).
    if (has("built pre-1990", "built pre-1950") &&
        has("drill", "sand", "cut into", "grind", "demolish", "remove the wall", "remove a wall", "renovat")) {
      return needsPro({
        category: "structural",
        regulated_domains: ["none"],
        safety_flags: ["asbestos_suspected"],
        recommended_trade: "builder",
        licence: "Licensed asbestos removalist",
        why:
          "This home is from the asbestos era and the work disturbs the building fabric — " +
          "materials must be checked before anyone drills, sands or cuts.",
        title: "Asbestos-era home — check before disturbing",
        summary: "Work disturbing wall/ceiling materials in a pre-1990 home; asbestos check required first.",
        symptoms: ["Planned work disturbs building materials in an asbestos-era home"],
        questions: ["Has the material ever been tested for asbestos?"],
        userMessage:
          "Because your home is from the asbestos era, please don't drill, sand or cut this material " +
          "until it's been checked. I've routed this to a licensed professional.",
        photoCount: input.photoCount,
      });
    }

    // --- PRO: plasterboard / ceiling repair (carpentry; under $5k = no licence class) ---
    if (has("plasterboard", "ceiling repair", "repair the ceiling", "gyprock")) {
      return needsPro({
        category: "carpentry",
        regulated_domains: ["none"],
        recommended_trade: "builder",
        licence: null,
        why: "Ceiling sheeting needs a qualified carpenter to replace and finish safely.",
        title: "Plasterboard ceiling repair",
        summary: "A damaged plasterboard ceiling section needs replacing by a carpenter.",
        symptoms: ["Damaged or water-affected plasterboard"],
        questions: ["Roughly how large is the damaged section?", "Is the ceiling insulated above?"],
        userMessage:
          "This is a carpentry repair. I've written up the details so you'll get a firm quote shortly.",
        photoCount: input.photoCount,
      });
    }

    // --- PRO: patch & paint (handyman; legal DIY but routed when part of a project) ---
    if (has("repaint", "patch, sand", "patch and paint", "paint the ceiling")) {
      return needsPro({
        category: "handyman",
        regulated_domains: ["none"],
        recommended_trade: "handyman",
        licence: null,
        why: "Finishing work — a handyman will patch, sand and repaint for a clean result.",
        title: "Patch and repaint",
        summary: "A repaired surface needs patching, sanding and repainting.",
        symptoms: ["Surface needs patching and repainting"],
        questions: ["Do you have matching paint, or should the trade colour-match?"],
        userMessage:
          "A handyman can make this look like it never happened. You'll get a firm quote shortly.",
        photoCount: input.photoCount,
      });
    }

    // --- DIY: cabinet / door / hinge (example A) ---
    if (has("cabinet", "hinge", "door won't close", "drawer", "sticking door", "squeaky door")) {
      return diySafe({
        category: "carpentry",
        recommended_trade: "handyman",
        steps: [
          "Open the door and check the hinge screws are all present and seated.",
          "Tighten the two screws on each hinge plate with a Phillips screwdriver.",
          "If the door still rubs, loosen the depth adjustment screw a quarter turn and re-test.",
        ],
        tools: ["Phillips screwdriver"],
        stops: [
          "If the hinge is cracked or the cabinet is pulling off the wall, stop — that's a mounting issue for a handyman/carpenter.",
        ],
        userMessage: "This is almost always loose hinge screws — an easy fix. Here's how...",
        photoCount: input.photoCount,
      });
    }

    // --- DIY: tripped safety switch (reset ONCE) ---
    if (has("tripped", "safety switch", "circuit breaker won't", "breaker tripped", "rcd tripped")) {
      return diySafe({
        category: "electrical",
        recommended_trade: "electrician",
        regulated_domains: ["none"],
        steps: [
          "Go to your switchboard and find the switch that has flipped to the OFF position.",
          "Firmly push it back to ON once.",
        ],
        tools: [],
        stops: [
          "If it trips again, stop and call a licensed electrician — repeated tripping means a fault that needs a professional.",
          "Do not tape, wedge or bypass the switch.",
        ],
        userMessage:
          "You can safely reset a tripped switch once. If it trips again, that's a fault — stop and call a licensed electrician.",
        photoCount: input.photoCount,
      });
    }

    // --- DIY: blocked sink (plunger) ---
    if (has("blocked sink", "blocked basin", "slow drain", "clogged sink", "blocked toilet")) {
      return diySafe({
        category: "plumbing_water",
        recommended_trade: "plumber",
        regulated_domains: ["none"],
        steps: [
          "Remove any visible hair or debris from the drain opening or strainer.",
          "Fill the basin with a few centimetres of water and work a cup plunger over the drain 10–15 times.",
        ],
        tools: ["Cup plunger", "Rubber gloves"],
        stops: [
          "Do not dismantle the pipes or the P-trap.",
          "If the blockage won't clear, or more than one fixture is affected, stop and call a licensed plumber.",
        ],
        userMessage:
          "A plunger clears most simple blockages. If it won't budge or several fixtures are affected, it's time for a licensed plumber.",
        photoCount: input.photoCount,
      });
    }

    // --- UNCLEAR default ---
    return unclear(input);
  }
}

// ---- builders (keep example outputs terse and consistent) ----

function base(photoCount: number): Pick<ModelTriage, "confidence" | "likely_causes" | "clarifying_questions" | "disclaimer"> {
  return {
    confidence: "medium",
    likely_causes: [],
    clarifying_questions: [],
    disclaimer: GENERAL_DISCLAIMER,
  };
}

function emergency(a: {
  category: ModelTriage["category"];
  regulated_domains: ModelTriage["regulated_domains"];
  safety_flags: ModelTriage["safety_flags"];
  recommended_trade: ModelTriage["recommended_trade"];
  title: string;
  summary: string;
  symptoms: string[];
  userMessage: string;
  photoCount: number;
}): ModelTriage {
  return {
    verdict: "EMERGENCY_STOP",
    category: a.category,
    regulated_domains: a.regulated_domains,
    safety_flags: a.safety_flags,
    recommended_trade: a.recommended_trade,
    required_licence_class: null,
    diy_guidance: null,
    why_pro_needed: "This is an immediate hazard and regulated work — it needs a licensed professional.",
    job_spec: {
      title: a.title,
      summary: a.summary,
      symptoms: a.symptoms,
      access_notes: "",
      questions_for_site_visit: [],
      urgency: "emergency",
      photos_attached: a.photoCount > 0,
    },
    user_message: a.userMessage,
    ...base(a.photoCount),
  };
}

function needsPro(a: {
  category: ModelTriage["category"];
  regulated_domains: ModelTriage["regulated_domains"];
  safety_flags?: ModelTriage["safety_flags"];
  recommended_trade: ModelTriage["recommended_trade"];
  licence: string | null;
  why: string;
  title: string;
  summary: string;
  symptoms: string[];
  questions: string[];
  userMessage: string;
  photoCount: number;
}): ModelTriage {
  return {
    verdict: "NEEDS_LICENSED_PRO",
    category: a.category,
    regulated_domains: a.regulated_domains,
    safety_flags: a.safety_flags ?? ["none"],
    recommended_trade: a.recommended_trade,
    required_licence_class: a.licence,
    diy_guidance: null,
    why_pro_needed: a.why,
    job_spec: {
      title: a.title,
      summary: a.summary,
      symptoms: a.symptoms,
      access_notes: "",
      questions_for_site_visit: a.questions,
      urgency: "routine",
      photos_attached: a.photoCount > 0,
    },
    user_message: a.userMessage,
    ...base(a.photoCount),
  };
}

function diySafe(a: {
  category: ModelTriage["category"];
  recommended_trade: ModelTriage["recommended_trade"];
  regulated_domains?: ModelTriage["regulated_domains"];
  steps: string[];
  tools: string[];
  stops: string[];
  userMessage: string;
  photoCount: number;
}): ModelTriage {
  return {
    verdict: "DIY_SAFE",
    category: a.category,
    regulated_domains: a.regulated_domains ?? ["none"],
    safety_flags: ["none"],
    recommended_trade: a.recommended_trade,
    required_licence_class: null,
    diy_guidance: {
      steps: a.steps,
      tools_required: a.tools,
      stop_conditions: a.stops,
    },
    why_pro_needed: null,
    job_spec: null,
    user_message: a.userMessage,
    ...base(a.photoCount),
    disclaimer: `${GENERAL_DISCLAIMER} ${DIY_DISCLAIMER}`,
  };
}

function unclear(input: TriageInput): ModelTriage {
  return {
    verdict: "UNCLEAR",
    category: "other",
    regulated_domains: ["none"],
    safety_flags: ["none"],
    recommended_trade: "none",
    required_licence_class: null,
    diy_guidance: null,
    why_pro_needed: null,
    job_spec: null,
    clarifying_questions: [
      "Is there any burning smell, smoke or sparking?",
      "Is there any water near electrical fittings?",
      "Whereabouts in the home is the problem, and when did it start?",
    ],
    user_message:
      "I need a little more detail to route this safely — could you answer the questions below?",
    confidence: "low",
    likely_causes: [],
    disclaimer: GENERAL_DISCLAIMER,
  };
}
