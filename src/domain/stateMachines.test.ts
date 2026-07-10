import { describe, it, expect } from "vitest";
import {
  assertJobTransition,
  canTransitionJob,
  canTransitionQuote,
  InvalidTransitionError,
} from "./stateMachines.js";

describe("job state machine (§6)", () => {
  it("allows the DIY branch to terminate", () => {
    expect(canTransitionJob("TRIAGED", "DIY_RESOLVED")).toBe(true);
    expect(canTransitionJob("DIY_RESOLVED", "QUOTED")).toBe(false);
  });

  it("allows the custom-quote → quoted → booked → reviewed happy path", () => {
    expect(canTransitionJob("TRIAGED", "AWAITING_QUOTE")).toBe(true);
    expect(canTransitionJob("AWAITING_QUOTE", "QUOTED")).toBe(true);
    expect(canTransitionJob("QUOTED", "BOOKED")).toBe(true);
    expect(canTransitionJob("BOOKED", "COMPLETED")).toBe(true);
    expect(canTransitionJob("COMPLETED", "REVIEWED")).toBe(true);
  });

  it("allows the price-book instant-quote path (TRIAGED → QUOTED)", () => {
    expect(canTransitionJob("TRIAGED", "QUOTED")).toBe(true);
  });

  it("rejects illegal jumps", () => {
    expect(canTransitionJob("COMPLETED", "AWAITING_QUOTE")).toBe(false);
    expect(() => assertJobTransition("REVIEWED", "QUOTED")).toThrow(InvalidTransitionError);
  });
});

describe("quote state machine (§6)", () => {
  it("only allows transitions out of offered", () => {
    expect(canTransitionQuote("offered", "accepted")).toBe(true);
    expect(canTransitionQuote("accepted", "declined")).toBe(false);
  });
});
