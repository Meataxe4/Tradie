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
    expect(canTransitionJob("DIY_RESOLVED", "POSTED")).toBe(false);
  });

  it("allows the quoting → booked → reviewed happy path", () => {
    expect(canTransitionJob("POSTED", "QUOTING")).toBe(true);
    expect(canTransitionJob("QUOTING", "QUOTE_ACCEPTED")).toBe(true);
    expect(canTransitionJob("QUOTE_ACCEPTED", "BOOKED")).toBe(true);
    expect(canTransitionJob("BOOKED", "COMPLETED")).toBe(true);
    expect(canTransitionJob("COMPLETED", "REVIEWED")).toBe(true);
  });

  it("rejects illegal jumps", () => {
    expect(canTransitionJob("COMPLETED", "QUOTING")).toBe(false);
    expect(() => assertJobTransition("REVIEWED", "POSTED")).toThrow(InvalidTransitionError);
  });
});

describe("quote state machine (§6)", () => {
  it("only allows transitions out of submitted", () => {
    expect(canTransitionQuote("submitted", "accepted")).toBe(true);
    expect(canTransitionQuote("accepted", "declined")).toBe(false);
  });
});
