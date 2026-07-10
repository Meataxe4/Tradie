import { describe, it, expect } from "vitest";
import {
  classSatisfies,
  licenceMatches,
  matchTradies,
  tradieCanServe,
} from "./matching.js";
import type { Job, TradieProfile, Licence } from "./entities.js";
import type { TriageResult } from "../triage/schema.js";

const NOW = "2026-07-04T00:00:00.000Z";

function tradie(over: Partial<TradieProfile> = {}): TradieProfile {
  return {
    user_id: "t1",
    business_name: "Sparky",
    abn: "1",
    trades: ["electrical"],
    licences: [
      {
        number: "EC1",
        class: "Unrestricted electrical licence",
        state: "NSW",
        verified_status: "verified",
        expiry: "2027-01-01",
      },
    ],
    insurance: {},
    service_postcodes: ["2042"],
    rating_avg: 4.5,
    jobs_completed: 10,
    verified_status: "verified",
    avg_response_minutes: 30,
    ...over,
  };
}

const job: Job = {
  id: "j1",
  homeowner_id: "h1",
  category: "electrical",
  description: "dead outlet",
  photos: [],
  suburb: "Newtown",
  postcode: "2042",
  state: "NSW",
  urgency: "routine",
  status: "AWAITING_QUOTE",
  created_at: NOW,
};

const triage = {
  required_licence_class: "Unrestricted electrical licence",
} as TriageResult;

describe("classSatisfies", () => {
  it("a restricted licence never satisfies an unrestricted requirement", () => {
    expect(
      classSatisfies("Restricted electrical licence", "Unrestricted electrical licence"),
    ).toBe(false);
  });
  it("an unrestricted licence satisfies an unrestricted requirement", () => {
    expect(
      classSatisfies("Unrestricted electrical licence", "Unrestricted electrical licence"),
    ).toBe(true);
  });
  it("a plumbing licence does not satisfy an electrical requirement", () => {
    expect(
      classSatisfies("Plumbing contractor licence", "Unrestricted electrical licence"),
    ).toBe(false);
  });
});

describe("licenceMatches", () => {
  const lic: Licence = {
    number: "EC1",
    class: "Unrestricted electrical licence",
    state: "NSW",
    verified_status: "verified",
    expiry: "2027-01-01",
  };
  it("rejects a licence from a different state", () => {
    expect(licenceMatches({ ...lic, state: "VIC" }, "Unrestricted electrical licence", "NSW", NOW)).toBe(false);
  });
  it("rejects an unverified licence", () => {
    expect(licenceMatches({ ...lic, verified_status: "pending" }, "Unrestricted electrical licence", "NSW", NOW)).toBe(false);
  });
  it("rejects an expired licence", () => {
    expect(licenceMatches({ ...lic, expiry: "2020-01-01" }, "Unrestricted electrical licence", "NSW", NOW)).toBe(false);
  });
  it("accepts a valid, verified, in-state, unexpired licence", () => {
    expect(licenceMatches(lic, "Unrestricted electrical licence", "NSW", NOW)).toBe(true);
  });
});

describe("tradieCanServe", () => {
  it("matches when trade, postcode and licence all line up", () => {
    expect(tradieCanServe(tradie(), job, triage, { now: NOW })).toBe(true);
  });
  it("rejects a tradie who doesn't service the postcode", () => {
    expect(tradieCanServe(tradie({ service_postcodes: ["3000"] }), job, triage, { now: NOW })).toBe(false);
  });
  it("rejects a tradie without the required trade", () => {
    expect(tradieCanServe(tradie({ trades: ["plumbing_water"] }), job, triage, { now: NOW })).toBe(false);
  });
  it("rejects an unverified tradie", () => {
    expect(tradieCanServe(tradie({ verified_status: "pending" }), job, triage, { now: NOW })).toBe(false);
  });
  it("rejects a tradie holding only a restricted licence", () => {
    const restricted = tradie({
      licences: [{ number: "R1", class: "Restricted electrical licence", state: "NSW", verified_status: "verified", expiry: "2027-01-01" }],
    });
    expect(tradieCanServe(restricted, job, triage, { now: NOW })).toBe(false);
  });
});

describe("matchTradies", () => {
  it("ranks by rating × response speed and caps the list", () => {
    const fast = tradie({ user_id: "fast", rating_avg: 4.0, avg_response_minutes: 10 });
    const slow = tradie({ user_id: "slow", rating_avg: 4.9, avg_response_minutes: 600 });
    const ranked = matchTradies(job, triage, [slow, fast], { now: NOW, cap: 4 });
    expect(ranked.map((r) => r.tradie.user_id)).toEqual(["fast", "slow"]);
  });
  it("respects the cap", () => {
    const many = Array.from({ length: 6 }, (_, i) => tradie({ user_id: `t${i}` }));
    expect(matchTradies(job, triage, many, { now: NOW, cap: 3 })).toHaveLength(3);
  });
});
