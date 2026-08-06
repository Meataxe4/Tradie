import { describe, it, expect } from "vitest";
import { detectMultiTradePlan } from "./multiTrade.js";
import { certificateRequirement } from "./certificates.js";
import { MemoryStore } from "../store/memoryStore.js";
import { MarketplaceService } from "../services/marketplaceService.js";
import { TriageService } from "../triage/triageService.js";
import { MockTriageClient } from "../triage/llmClient.js";
import { seed } from "../seed.js";

const NOW = "2026-07-04T00:00:00.000Z";

function build() {
  const store = new MemoryStore();
  seed(store, NOW);
  const market = new MarketplaceService(store, new TriageService({ llm: new MockTriageClient(), clock: () => NOW }), () => NOW);
  return { store, market };
}

const base = { homeowner_id: "home-1", photos: [], suburb: "Newtown", postcode: "2042", state: "NSW" as const };

describe("multi-trade decomposition", () => {
  it("plans the ceiling-leak case as plumber → carpenter → painter", () => {
    const plan = detectMultiTradePlan("There's water leaking through the ceiling in the hallway");
    expect(plan?.stages.map((s) => s.category)).toEqual(["plumbing_water", "carpentry", "handyman"]);
  });

  it("returns null for single-trade problems", () => {
    expect(detectMultiTradePlan("A power point in the bedroom is dead")).toBeNull();
  });

  it("creates a sequenced project; each stage is a clean single-trade job", async () => {
    const { store, market } = build();
    const res = await market.createJob({ ...base, description: "There's water leaking through the ceiling in the hallway" });

    expect(res.project).toBeDefined();
    const p = res.project!;
    expect(p.kind).toBe("multi_trade");
    expect(p.stages).toHaveLength(3);
    expect(p.stages.map((s) => s.category)).toEqual(["plumbing_water", "carpentry", "handyman"]);
    expect(p.stages.map((s) => s.stage_index)).toEqual([1, 2, 3]);

    // Each stage went through the full pipeline and was assigned per-trade.
    const jobs = p.stages.map((s) => store.jobs.get(s.job_id)!);
    expect(jobs[0]!.assigned_tradie_id).toBe("plumb-1");
    expect(jobs[1]!.assigned_tradie_id).toBe("chip-1");
    expect(jobs[2]!.assigned_tradie_id).toBe("chip-1");
    // Every stage has its own gated triage (no stage skips safety).
    for (const j of jobs) expect(store.triageByJob.get(j.id)).toBeTruthy();
    // Photos only travel with the diagnostic first stage.
    expect(jobs[1]!.photos).toEqual([]);
  });

  it("never decomposes an emergency (safety verdicts win)", async () => {
    const { market } = build();
    // Water near electrical is an emergency trigger even though it mentions the ceiling.
    const res = await market.createJob({ ...base, description: "Water coming through the light on the ceiling" });
    expect(res.project).toBeUndefined();
    expect(res.triage.final_verdict).toBe("EMERGENCY_STOP");
  });
});

describe("customer projects", () => {
  it("groups jobs with indicative pricing and one firm total", async () => {
    const { market } = build();
    const project = market.createProject("home-1", "Fix the bathroom");
    // Price-book job → firm quote; custom job → ballpark only.
    await market.createJob({ ...base, description: "Replace the mixer tap in the bathroom", project_id: project.id });
    await market.createJob({ ...base, description: "The oven has stopped heating up properly", project_id: project.id });

    const view = market.projectView(market.mustProject(project.id));
    expect(view.stages).toHaveLength(2);
    expect(view.stages[0]!.quote_amount).toBe(28000); // price-book mixer
    expect(view.stages[1]!.quote_amount).toBeNull();
    expect(view.stages[1]!.ballpark).not.toBeNull(); // indicative, clearly not firm
    expect(view.firm_total).toBe(28000);
    expect(view.all_priced).toBe(false);
  });

  it("won't attach a job to someone else's project", async () => {
    const { store, market } = build();
    const project = market.createProject("home-1", "Mine");
    // A different homeowner posting into that project id is silently not attached.
    store.users.set("home-2", { id: "home-2", role: "homeowner", email: "x@x.com", created_at: NOW, status: "active" });
    store.homeowners.set("home-2", { user_id: "home-2" });
    const res = await market.createJob({ ...base, homeowner_id: "home-2", description: "The oven has stopped heating up properly", project_id: project.id });
    expect(res.job.project_id).toBeUndefined();
    expect(market.mustProject(project.id).job_ids).toHaveLength(0);
  });
});

describe("certification layer", () => {
  it("knows the NSW certificate regime per category", () => {
    expect(certificateRequirement("electrical")?.name).toContain("CCEW");
    expect(certificateRequirement("gas")?.name).toContain("Gas");
    expect(certificateRequirement("plumbing_water")?.name).toContain("Plumbing");
    expect(certificateRequirement("carpentry")).toBeNull(); // statutory warranties
  });

  it("lets the assigned trade attach a certificate after completion, once", async () => {
    const { market } = build();
    const created = await market.createJob({ ...base, description: "A power point in the bedroom is dead" });
    const { booking } = market.acceptQuote(created.quote!.id);

    // Too early: job not completed yet.
    expect(() => market.attachCertificate({ booking_id: booking.id, tradie_id: "spark-1", reference: "CCEW-1" }))
      .toThrow(/after completion/);

    market.completeBooking(booking.id);
    const job = market.attachCertificate({ booking_id: booking.id, tradie_id: "spark-1", reference: "CCEW-12345" });
    expect(job.certificate).toEqual({ name: "Certificate of Compliance (CCEW)", reference: "CCEW-12345", lodged_at: NOW });

    // Only once, and only the assigned trade.
    expect(() => market.attachCertificate({ booking_id: booking.id, tradie_id: "spark-1", reference: "again" }))
      .toThrow(/already attached/);
    expect(() => market.attachCertificate({ booking_id: booking.id, tradie_id: "plumb-1", reference: "x" }))
      .toThrow(/isn't yours/);
  });
});

describe("multi-trade detection handles natural phrasings (Blake QA, 6 Aug)", () => {
  it.each([
    "Water Leaking from Roof",
    "water leaking from the roof",
    "my roof is leaking",
    "there's water dripping from the ceiling",
    "the ceiling is leaking near the light",
  ])("'%s' plans the multi-trade ceiling-leak project", (phrase) => {
    const plan = detectMultiTradePlan(phrase);
    expect(plan).not.toBeNull();
    expect(plan?.stages.map((s) => s.category)).toEqual(["plumbing_water", "carpentry", "handyman"]);
  });
});

describe("multi-trade INFERENCE (Blake, 6 Aug: decipher trades, don't pattern-match)", () => {
  it("water into building fabric implies repair + repaint even when unsaid", () => {
    for (const phrase of [
      "There's a damp patch spreading on the lounge room wall",
      "Water is pouring in under the laundry floor",
      "found moisture in the ceiling near the bathroom",
    ]) {
      const plan = detectMultiTradePlan(phrase);
      expect(plan, phrase).not.toBeNull();
      expect(plan!.stages.map((s) => s.category)).toEqual(["plumbing_water", "carpentry", "handyman"]);
    }
  });

  it("explicit multi-domain descriptions are decomposed in dependency order", () => {
    const plan = detectMultiTradePlan("Renovating the bathroom — new tiles, move the shower and add a power point over the vanity");
    expect(plan).not.toBeNull();
    const cats = plan!.stages.map((s) => s.category);
    expect(cats).toContain("plumbing_water");
    expect(cats).toContain("electrical");
    expect(cats.indexOf("plumbing_water")).toBeLessThan(cats.indexOf("carpentry"));
  });

  it("a damaged wall needing paint is carpenter then painter", () => {
    const plan = detectMultiTradePlan("There's a hole in the plasterboard wall that needs patching and repainting");
    expect(plan!.stages.map((s) => s.category)).toEqual(["carpentry", "handyman"]);
  });

  it("contained single-trade problems stay single", () => {
    expect(detectMultiTradePlan("The bathroom tap is dripping constantly")).toBeNull();
    expect(detectMultiTradePlan("Water leaking under the kitchen sink")).toBeNull();
    expect(detectMultiTradePlan("A power point in the bedroom is dead")).toBeNull();
    expect(detectMultiTradePlan("The oven has stopped heating up properly")).toBeNull();
  });
});
