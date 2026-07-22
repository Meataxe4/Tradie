import { describe, it, expect } from "vitest";
import { TriageService } from "./triageService.js";
import { MockTriageClient, type TriageLlmClient, type TriageInput } from "./llmClient.js";
import type { ModelTriage } from "./schema.js";
import { MemoryStore } from "../store/memoryStore.js";
import { MarketplaceService } from "../services/marketplaceService.js";
import { seed } from "../seed.js";

const NOW = "2026-07-04T00:00:00.000Z";
const IMG = { media_type: "image/jpeg", data: "AAAA" };
const svc = () => new TriageService({ llm: new MockTriageClient(), clock: () => NOW });

describe("photo captions feed triage (honest, offline)", () => {
  it("a caption describing a hazard ESCALATES a benign description", async () => {
    // Description alone is a safe DIY door job; the photo note reports gas.
    const out = await svc().triage({
      description: "the cabinet door won't close properly",
      photoCount: 1,
      images: [IMG],
      captions: ["there's a strong gas smell near it"],
    });
    expect(out.gate.triage.verdict).toBe("EMERGENCY_STOP");
    expect(out.gate.triage.diy_guidance).toBeNull(); // DIY steps stripped by the gate
  });

  it("photos never downgrade risk (a pro job stays a pro job)", async () => {
    const base = { description: "a power point in the bedroom is dead", photoCount: 0 } as TriageInput;
    const noPhoto = await svc().triage(base);
    const withPhoto = await svc().triage({ ...base, photoCount: 1, images: [IMG], captions: ["looks fine to me"] });
    expect(noPhoto.gate.triage.verdict).toBe("NEEDS_LICENSED_PRO");
    expect(withPhoto.gate.triage.verdict).toBe("NEEDS_LICENSED_PRO");
  });
});

describe("vision summary is transparent", () => {
  it("reports 'none' when there are no photos", async () => {
    const out = await svc().triage({ description: "a power point is dead", photoCount: 0 });
    expect(out.vision).toEqual({ photos: 0, captions: 0, analyzed: false, mode: "none" });
  });

  it("reports 'preview' (never analysed) for the offline mock, counting captions", async () => {
    const out = await svc().triage({
      description: "a power point is dead",
      photoCount: 2,
      images: [IMG, IMG],
      captions: ["scorch mark", ""],
    });
    expect(out.vision).toEqual({ photos: 2, captions: 1, analyzed: false, mode: "preview" });
  });

  it("reports 'live' + analysed only for a vision-capable client", async () => {
    const visionClient: TriageLlmClient = {
      supportsVision: true,
      async classify(): Promise<ModelTriage> {
        return new MockTriageClient().classify({ description: "a power point is dead", photoCount: 1 });
      },
    };
    const out = await new TriageService({ llm: visionClient, clock: () => NOW }).triage({
      description: "a power point is dead",
      photoCount: 1,
      images: [IMG],
    });
    expect(out.vision.mode).toBe("live");
    expect(out.vision.analyzed).toBe(true);
  });

  it("still returns a vision summary when triage fails closed", async () => {
    const boom: TriageLlmClient = { supportsVision: true, async classify() { throw new Error("model down"); } };
    const out = await new TriageService({ llm: boom, clock: () => NOW }).triage({
      description: "something", photoCount: 1, images: [IMG],
    });
    expect(out.failedClosed).toBe(true);
    expect(out.gate.triage.verdict).toBe("NEEDS_LICENSED_PRO"); // fail closed
    expect(out.vision.mode).toBe("live");
  });
});

describe("pre-visit ballpark", () => {
  function build() {
    const store = new MemoryStore();
    seed(store, NOW);
    return new MarketplaceService(store, svc(), () => NOW);
  }
  const job = (description: string) => ({
    homeowner_id: "home-1", description, photos: [], suburb: "Newtown", postcode: "2042", state: "NSW" as const,
  });

  it("returns a sensible range for a custom job awaiting a quote", async () => {
    const created = await build().createJob(job("The oven has stopped heating up properly"));
    expect(created.job.status).toBe("AWAITING_QUOTE");
    expect(created.ballpark).not.toBeNull();
    expect(created.ballpark!.low).toBeGreaterThan(0);
    expect(created.ballpark!.high).toBeGreaterThan(created.ballpark!.low);
    expect(created.ballpark!.low % 500).toBe(0);
  });

  it("gives no ballpark for a price-book job (already firm) or a DIY job", async () => {
    const priceBook = await build().createJob(job("a power point in the bedroom is dead"));
    expect(priceBook.job.status).toBe("QUOTED");
    expect(priceBook.ballpark).toBeNull();

    const diy = await build().createJob(job("the cabinet door won't close"));
    expect(diy.job.status).toBe("DIY_RESOLVED");
    expect(diy.ballpark).toBeNull();
  });

  it("carries the vision summary onto the persisted triage", async () => {
    const store = new MemoryStore();
    seed(store, NOW);
    const market = new MarketplaceService(store, svc(), () => NOW);
    const created = await market.createJob({ ...job("The oven has stopped heating up properly"), photos: ["data:image/jpeg;base64,AAAA"], images: [IMG], captions: ["burnt element"] } as never);
    expect(created.triage.vision?.mode).toBe("preview");
    expect(created.vision.photos).toBe(1);
  });
});

describe("ask-once property profile (M2.5)", () => {
  it("asbestos-era property context ESCALATES work disturbing the fabric", async () => {
    const store = new MemoryStore();
    seed(store, NOW);
    const market = new MarketplaceService(store, svc(), () => NOW);
    market.updateHomeownerProfile("home-1", { property: { build_era: "1950-1990", dwelling: "house" } });
    const res = await market.createSingleJob({
      homeowner_id: "home-1",
      description: "I want to sand back and repaint the hallway wall",
      photos: [], suburb: "Newtown", postcode: "2042", state: "NSW",
    });
    expect(res.triage.result.safety_flags).toContain("asbestos_suspected");
    // The gate escalates any active safety flag to EMERGENCY_STOP — the
    // conservative option wins (same as the explicit-asbestos pattern).
    expect(res.triage.final_verdict).toBe("EMERGENCY_STOP");
  });

  it("createJob remembers the location so it's never asked again", async () => {
    const store = new MemoryStore();
    seed(store, NOW);
    const market = new MarketplaceService(store, svc(), () => NOW);
    await market.createJob({
      homeowner_id: "home-1",
      description: "The oven has stopped heating up properly",
      photos: [], suburb: "Enmore", postcode: "2042", state: "NSW",
      full_address: "5 Test Ln, Enmore NSW 2042",
    });
    const owner = store.homeowners.get("home-1")!;
    expect(owner.suburb).toBe("Enmore");
    expect(owner.default_address).toBe("5 Test Ln, Enmore NSW 2042");
  });
});

describe("QA regressions from partner review", () => {
  // Phil, 22 Jul: "water leaking under kitchen sink" fell through to
  // UNCLEAR/"other" and the UI offered "a vetted local none".
  it("'water leaking under kitchen sink' routes to a licensed plumber", async () => {
    const out = await svc().triage({
      description: "water leaking under kitchen sink",
      photoCount: 0,
    });
    expect(out.gate.triage.verdict).toBe("NEEDS_LICENSED_PRO");
    expect(out.gate.triage.category).toBe("plumbing_water");
    expect(out.gate.triage.recommended_trade).toBe("plumber");
  });
});
