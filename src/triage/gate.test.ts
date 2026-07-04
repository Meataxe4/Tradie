import { describe, it, expect } from "vitest";
import { runGate } from "./gate.js";
import { modelTriageSchema, type ModelTriage } from "./schema.js";
import { GENERAL_DISCLAIMER } from "./systemPrompt.js";

const TID = "00000000-0000-4000-8000-000000000000";

/** Build a valid ModelTriage, overriding just the fields a test cares about. */
function model(partial: Partial<ModelTriage>): ModelTriage {
  const baseObj: ModelTriage = {
    verdict: "DIY_SAFE",
    confidence: "medium",
    category: "carpentry",
    regulated_domains: ["none"],
    safety_flags: ["none"],
    likely_causes: [],
    recommended_trade: "handyman",
    required_licence_class: null,
    clarifying_questions: [],
    diy_guidance: {
      steps: ["Tighten the hinge screws."],
      tools_required: ["Phillips screwdriver"],
      stop_conditions: ["If the cabinet is pulling off the wall, stop and call a carpenter."],
    },
    why_pro_needed: null,
    job_spec: null,
    user_message: "Easy fix — here's how.",
    disclaimer: GENERAL_DISCLAIMER,
  };
  return modelTriageSchema.parse({ ...baseObj, ...partial });
}

describe("gate: safe cases pass through", () => {
  it("keeps a genuinely DIY_SAFE, non-regulated job as DIY_SAFE with guidance", () => {
    const { triage, overrides } = runGate(TID, model({}));
    expect(triage.verdict).toBe("DIY_SAFE");
    expect(triage.diy_guidance).not.toBeNull();
    expect(overrides).toHaveLength(0);
  });

  it("keeps a NEEDS_LICENSED_PRO electrical job unchanged", () => {
    const { triage, overrides } = runGate(
      TID,
      model({
        verdict: "NEEDS_LICENSED_PRO",
        category: "electrical",
        regulated_domains: ["electrical"],
        recommended_trade: "electrician",
        required_licence_class: "Unrestricted electrical licence",
        diy_guidance: null,
        why_pro_needed: "Fixed wiring is licensed work.",
        job_spec: {
          title: "Dead power point",
          summary: "Single dead outlet.",
          symptoms: ["No power"],
          access_notes: "",
          questions_for_site_visit: ["Has the safety switch tripped?"],
          urgency: "routine",
          photos_attached: false,
        },
        user_message: "Needs a licensed electrician.",
      }),
    );
    expect(triage.verdict).toBe("NEEDS_LICENSED_PRO");
    expect(overrides).toHaveLength(0);
  });
});

describe("gate: model slip on a regulated category is coerced up", () => {
  it("strips DIY guidance and escalates when electrical is marked DIY_SAFE", () => {
    const { triage, overrides, model_verdict } = runGate(
      TID,
      model({
        verdict: "DIY_SAFE",
        category: "electrical",
        regulated_domains: ["electrical"],
        recommended_trade: "electrician",
        diy_guidance: {
          steps: ["Unscrew the faceplate and reconnect the loose wire."],
          tools_required: ["Screwdriver"],
          stop_conditions: ["If unsure, call an electrician."],
        },
      }),
    );
    expect(model_verdict).toBe("DIY_SAFE");
    expect(triage.verdict).toBe("NEEDS_LICENSED_PRO");
    expect(triage.diy_guidance).toBeNull();
    expect(triage.why_pro_needed).toBeTruthy();
    expect(overrides.some((o) => o.reason === "regulated_category_forces_pro")).toBe(true);
  });

  it("coerces on regulated_domains even if the category looks benign", () => {
    const { triage } = runGate(
      TID,
      model({
        verdict: "DIY_SAFE",
        category: "handyman",
        regulated_domains: ["gas"],
        diy_guidance: {
          steps: ["Relight the pilot."],
          tools_required: [],
          stop_conditions: ["Stop if you smell anything."],
        },
      }),
    );
    expect(triage.verdict).toBe("NEEDS_LICENSED_PRO");
    expect(triage.diy_guidance).toBeNull();
  });
});

describe("gate: safety flags force EMERGENCY_STOP", () => {
  it("forces EMERGENCY_STOP even when the model said DIY_SAFE", () => {
    const { triage, overrides } = runGate(
      TID,
      model({
        verdict: "DIY_SAFE",
        category: "electrical",
        safety_flags: ["fire_risk", "electrical_hazard"],
        diy_guidance: {
          steps: ["Ignore the burning smell and keep using it."],
          tools_required: [],
          stop_conditions: ["N/A"],
        },
      }),
    );
    expect(triage.verdict).toBe("EMERGENCY_STOP");
    expect(triage.diy_guidance).toBeNull();
    expect(overrides[0]?.reason).toBe("safety_flag_forces_emergency_stop");
  });

  it("forces EMERGENCY_STOP over a NEEDS_LICENSED_PRO verdict when a flag fires", () => {
    const { triage } = runGate(
      TID,
      model({
        verdict: "NEEDS_LICENSED_PRO",
        category: "gas",
        regulated_domains: ["gas"],
        safety_flags: ["gas_odour"],
        diy_guidance: null,
        job_spec: {
          title: "Gas smell",
          summary: "Reported gas odour.",
          symptoms: ["Gas smell"],
          access_notes: "",
          questions_for_site_visit: [],
          urgency: "emergency",
          photos_attached: false,
        },
      }),
    );
    expect(triage.verdict).toBe("EMERGENCY_STOP");
  });
});

describe("gate: banned-content scan of diy_guidance", () => {
  it("blocks DIY guidance that contains regulated keywords on a non-allowlisted job", () => {
    const { triage, overrides } = runGate(
      TID,
      model({
        verdict: "DIY_SAFE",
        category: "handyman", // not category-regulated, so only the scan catches it
        regulated_domains: ["none"],
        diy_guidance: {
          steps: ["Strip the wire back 10mm and reconnect it to the circuit."],
          tools_required: ["Wire strippers"],
          stop_conditions: ["Stop if unsure."],
        },
      }),
    );
    expect(triage.verdict).toBe("NEEDS_LICENSED_PRO");
    expect(triage.diy_guidance).toBeNull();
    expect(overrides.some((o) => o.reason === "banned_content_in_diy_guidance")).toBe(true);
  });

  it("does not false-positive on benign carpentry guidance", () => {
    const { triage, overrides } = runGate(TID, model({}));
    expect(triage.verdict).toBe("DIY_SAFE");
    expect(overrides).toHaveLength(0);
  });
});

describe("gate: escalation is one-directional", () => {
  it("never rounds an EMERGENCY_STOP down", () => {
    const { triage } = runGate(
      TID,
      model({
        verdict: "EMERGENCY_STOP",
        category: "carpentry",
        regulated_domains: ["none"],
        safety_flags: ["none"],
        diy_guidance: null,
        job_spec: {
          title: "x", summary: "x", symptoms: [], access_notes: "",
          questions_for_site_visit: [], urgency: "emergency", photos_attached: false,
        },
      }),
    );
    expect(triage.verdict).toBe("EMERGENCY_STOP");
  });
});

describe("gate: field hygiene after coercion", () => {
  it("drops clarifying_questions unless the final verdict is UNCLEAR", () => {
    const { triage } = runGate(
      TID,
      model({
        verdict: "UNCLEAR",
        category: "electrical", // will coerce up to NEEDS_LICENSED_PRO
        regulated_domains: ["electrical"],
        diy_guidance: null,
        clarifying_questions: ["Is there a smell?"],
        user_message: "Need more info.",
      }),
    );
    expect(triage.verdict).toBe("NEEDS_LICENSED_PRO");
    expect(triage.clarifying_questions).toHaveLength(0);
  });

  it("backfills required_licence_class from the recommended trade when missing", () => {
    const { triage } = runGate(
      TID,
      model({
        verdict: "NEEDS_LICENSED_PRO",
        category: "electrical",
        regulated_domains: ["electrical"],
        recommended_trade: "electrician",
        required_licence_class: null,
        diy_guidance: null,
        job_spec: {
          title: "x", summary: "x", symptoms: [], access_notes: "",
          questions_for_site_visit: [], urgency: "routine", photos_attached: false,
        },
      }),
    );
    expect(triage.required_licence_class).toBe("Unrestricted electrical licence");
  });
});
