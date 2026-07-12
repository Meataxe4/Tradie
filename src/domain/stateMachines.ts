/**
 * §6 Core state machines for Job and Quote. Centralising the allowed
 * transitions keeps illegal jumps (e.g. COMPLETED → QUOTING) out of the API.
 */
import type { JobStatus, QuoteStatus } from "./entities.js";

const JOB_TRANSITIONS: Record<JobStatus, JobStatus[]> = {
  DRAFT: ["TRIAGED", "CANCELLED"],
  TRIAGED: ["DIY_RESOLVED", "AWAITING_QUOTE", "QUOTED", "CANCELLED"],
  DIY_RESOLVED: [], // terminal
  AWAITING_QUOTE: ["QUOTED", "CANCELLED", "EXPIRED"],
  // QUOTED → AWAITING_QUOTE: customer declined the price and the job was
  // reassigned to the next vetted trade (decline-and-reassign, UX #9).
  QUOTED: ["BOOKED", "AWAITING_QUOTE", "DECLINED", "CANCELLED", "EXPIRED"],
  BOOKED: ["COMPLETED", "CANCELLED"],
  COMPLETED: ["REVIEWED"],
  REVIEWED: [], // terminal
  DECLINED: [], // terminal
  CANCELLED: [], // terminal
  EXPIRED: [], // terminal
};

const QUOTE_TRANSITIONS: Record<QuoteStatus, QuoteStatus[]> = {
  offered: ["accepted", "declined", "withdrawn", "expired"],
  accepted: [],
  declined: [],
  withdrawn: [],
  expired: [],
};

export function canTransitionJob(from: JobStatus, to: JobStatus): boolean {
  return JOB_TRANSITIONS[from].includes(to);
}

export function canTransitionQuote(from: QuoteStatus, to: QuoteStatus): boolean {
  return QUOTE_TRANSITIONS[from].includes(to);
}

export class InvalidTransitionError extends Error {
  constructor(entity: string, from: string, to: string) {
    super(`Invalid ${entity} transition: ${from} -> ${to}`);
    this.name = "InvalidTransitionError";
  }
}

export function assertJobTransition(from: JobStatus, to: JobStatus): void {
  if (!canTransitionJob(from, to)) throw new InvalidTransitionError("job", from, to);
}

export function assertQuoteTransition(from: QuoteStatus, to: QuoteStatus): void {
  if (!canTransitionQuote(from, to)) throw new InvalidTransitionError("quote", from, to);
}
