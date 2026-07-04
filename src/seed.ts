/**
 * Demo seed data so the app is explorable immediately: one homeowner, a couple
 * of verified tradies in the launch state (NSW), and an admin.
 */
import { MemoryStore } from "./store/memoryStore.js";
import { MarketplaceService } from "./services/marketplaceService.js";
import { TriageService } from "./triage/triageService.js";
import { MockTriageClient } from "./triage/llmClient.js";

export function seed(store: MemoryStore, now = "2026-07-04T00:00:00.000Z"): void {
  store.users.set("home-1", {
    id: "home-1",
    role: "homeowner",
    email: "owner@example.com",
    created_at: now,
    status: "active",
  });
  store.homeowners.set("home-1", {
    user_id: "home-1",
    suburb: "Newtown",
    postcode: "2042",
    default_address: "1 Example St, Newtown NSW 2042",
  });

  store.users.set("admin-1", {
    id: "admin-1",
    role: "admin",
    email: "admin@example.com",
    created_at: now,
    status: "active",
  });

  store.users.set("spark-1", {
    id: "spark-1",
    role: "tradie",
    email: "spark@example.com",
    created_at: now,
    status: "active",
  });
  store.tradies.set("spark-1", {
    user_id: "spark-1",
    business_name: "Inner West Electrical",
    abn: "12345678901",
    trades: ["electrical", "appliance"],
    licences: [
      {
        number: "EC-11111",
        class: "Unrestricted electrical licence",
        state: "NSW",
        verified_status: "verified",
        expiry: "2027-01-01",
      },
    ],
    insurance: { public_liability_expiry: "2027-01-01", doc_ref: "pl-doc-1" },
    service_postcodes: ["2042", "2040", "2037"],
    rating_avg: 4.8,
    jobs_completed: 40,
    verified_status: "verified",
    avg_response_minutes: 20,
  });

  store.users.set("plumb-1", {
    id: "plumb-1",
    role: "tradie",
    email: "plumb@example.com",
    created_at: now,
    status: "active",
  });
  store.tradies.set("plumb-1", {
    user_id: "plumb-1",
    business_name: "Newtown Plumbing Co",
    abn: "98765432109",
    trades: ["plumbing_water"],
    licences: [
      {
        number: "PL-22222",
        class: "Plumbing contractor licence",
        state: "NSW",
        verified_status: "verified",
        expiry: "2027-01-01",
      },
    ],
    insurance: { public_liability_expiry: "2027-01-01", doc_ref: "pl-doc-2" },
    service_postcodes: ["2042", "2043"],
    rating_avg: 4.6,
    jobs_completed: 25,
    verified_status: "verified",
    avg_response_minutes: 35,
  });
}

/**
 * Seed a few already-posted jobs so the tradie feed and homeowner list are
 * populated immediately (better demo, and gives the feed filters something to
 * work on). Runs each through the real triage + gate + matching pipeline using
 * the deterministic mock, so the data is internally consistent.
 *
 * Only used by the app entrypoint — tests seed with `seed()` alone.
 */
export async function seedDemoJobs(store: MemoryStore): Promise<void> {
  let cursor = Date.now() - 8 * 3600 * 1000; // start 8h ago
  const clock = () => new Date(cursor).toISOString();
  const market = new MarketplaceService(
    store,
    new TriageService({ llm: new MockTriageClient(), clock }),
    clock,
  );

  const base = {
    homeowner_id: "home-1",
    photos: ["photo-1"],
    suburb: "Newtown",
    postcode: "2042",
    state: "NSW" as const,
    full_address: "1 Example St, Newtown NSW 2042",
  };

  // Oldest → newest; staggered so "posted Xh ago" varies in the feed.
  const demo: Array<{ at: number; description: string }> = [
    { at: -8 * 3600e3, description: "The oven has stopped heating up properly" },
    { at: -6 * 3600e3, description: "A ceiling fan in the lounge won't turn on" },
    { at: -5 * 3600e3, description: "There's a burst pipe under the kitchen sink" },
    { at: -3 * 3600e3, description: "The downlight in the kitchen has stopped working" },
    { at: -75 * 60e3, description: "There's a burning smell coming from the switchboard" },
    { at: -20 * 60e3, description: "A power point in the bedroom is dead" },
  ];

  const now = Date.now();
  for (const d of demo) {
    cursor = now + d.at;
    await market.createJob({ ...base, description: d.description });
  }
}
