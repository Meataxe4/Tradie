/**
 * §5 Data model — entities and key fields. Kept as plain TypeScript types; the
 * in-memory store (store/memoryStore.ts) holds instances. Swap the store for a
 * real DB later without changing these shapes.
 */
import type { Category, TriageResult, Verdict } from "../triage/schema.js";
import type { Override } from "../triage/gate.js";
import type { VisionSummary } from "../triage/triageService.js";

export type Role = "homeowner" | "tradie" | "admin";
export type AustralianState = "NSW" | "VIC" | "QLD" | "WA" | "SA" | "TAS" | "ACT" | "NT";
export type VerifiedStatus = "unverified" | "pending" | "verified" | "rejected" | "expired";
export type Urgency = "emergency" | "urgent" | "routine";

export interface User {
  id: string;
  role: Role;
  email: string;
  phone?: string;
  created_at: string;
  status: "active" | "suspended";
}

export interface HomeownerProfile {
  user_id: string;
  default_address?: string;
  suburb?: string;
  postcode?: string;
  /** Rating the customer has received from trades (§4 two-way). */
  rating_avg?: number;
  ratings_count?: number;
}

export interface Licence {
  number: string;
  class: string;
  state: AustralianState;
  verified_status: VerifiedStatus;
  expiry?: string; // ISO date
}

export interface Insurance {
  public_liability_expiry?: string;
  doc_ref?: string;
}

export interface TradieProfile {
  user_id: string;
  business_name: string;
  abn: string;
  trades: Category[];
  licences: Licence[];
  insurance: Insurance;
  service_postcodes: string[];
  service_radius_km?: number;
  rating_avg: number;
  jobs_completed: number;
  verified_status: VerifiedStatus;
  /** Rolling median response time in minutes; lower ranks higher (§7). */
  avg_response_minutes?: number;
}

// §6 Job state machine — "assigned, not auctioned": a job is assigned to ONE
// vetted trade with a firm quote (price-book instant, or routed custom).
export type JobStatus =
  | "DRAFT"
  | "TRIAGED"
  | "DIY_RESOLVED" // safe DIY, terminal
  | "AWAITING_QUOTE" // custom job assigned to a trade; awaiting their firm quote
  | "QUOTED" // a firm quote is ready for the customer to accept
  | "BOOKED"
  | "COMPLETED"
  | "REVIEWED"
  | "DECLINED" // customer declined the quote, terminal
  | "CANCELLED"
  | "EXPIRED";

export type QuoteKind = "price_book" | "custom";

export interface Job {
  id: string;
  homeowner_id: string;
  category: Category;
  description: string;
  photos: string[]; // opaque refs
  suburb: string;
  postcode: string;
  state: AustralianState;
  /** Revealed to the assigned trade only, on BOOKED (§9). */
  full_address?: string;
  urgency: Urgency;
  status: JobStatus;
  /** The single vetted trade this job is assigned to (§3: assigned, not auctioned). */
  assigned_tradie_id?: string;
  /** How the quote is produced: instant from the price book, or a custom quote. */
  quote_kind?: QuoteKind;
  /** Price-book item key when quote_kind === "price_book". */
  price_book_key?: string;
  created_at: string;
}

export interface Triage {
  id: string;
  job_id: string;
  result: TriageResult; // full §2 JSON (post-gate)
  model_verdict: Verdict;
  final_verdict: Verdict;
  overrides: Override[];
  /** Transparent photo-analysis record, kept OUTSIDE the gated result. */
  vision?: VisionSummary;
  created_at: string;
}

// §6 Quote state machine. One firm quote per job (from the assigned trade).
export type QuoteStatus =
  | "offered"
  | "accepted"
  | "declined"
  | "withdrawn"
  | "expired";

export interface Quote {
  id: string;
  job_id: string;
  tradie_id: string;
  kind: QuoteKind;
  amount: number; // AUD cents, GST-inclusive — the firm price the customer pays
  inclusions: string;
  earliest_availability?: string;
  status: QuoteStatus;
  created_at: string;
}

export type MessageSenderRole = "homeowner" | "tradie";

export interface MessageThread {
  id: string;
  quote_id: string;
  job_id: string;
}

export interface Message {
  id: string;
  thread_id: string;
  sender_role: MessageSenderRole;
  /** Body AFTER the contact-masking filter (§9). */
  body: string;
  /** True if the filter redacted something (logged as a leakage attempt). */
  redacted: boolean;
  created_at: string;
}

export type BookingStatus = "scheduled" | "completed" | "cancelled";

export interface Booking {
  id: string;
  job_id: string;
  quote_id: string;
  tradie_id: string;
  scheduled_for?: string;
  status: BookingStatus;
}

// §4 Structured, two-way review. rater_role says who wrote it; ratee_id is the
// user being rated. `overall` is 1..5; `dimensions` are per-aspect 1..5 scores.
export interface Review {
  id: string;
  booking_id: string;
  job_id: string;
  rater_role: "homeowner" | "tradie";
  rater_id: string;
  ratee_id: string;
  overall: number; // 1..5
  dimensions: Record<string, number>; // each 1..5
  text: string;
  /** Public reply from the rated party (e.g. the trade replying to a review). */
  response?: string;
  responded_at?: string;
  created_at: string;
}

// §6 Payments — money held at booking, captured on completion, 5% fee.
export type PaymentStatus = "authorized" | "captured" | "canceled" | "failed";

export interface Payment {
  id: string;
  job_id: string;
  booking_id: string;
  quote_id: string;
  tradie_id: string;
  currency: "aud";
  /** Amount held at booking (cents, GST-inclusive). */
  amount_authorized: number;
  /** Amount actually captured on completion (base + approved variations). */
  amount_captured?: number;
  /** 5% platform fee on the captured amount (cents). */
  platform_fee?: number;
  /** What the trade receives after the fee (cents). */
  trade_payout?: number;
  status: PaymentStatus;
  provider: string;
  provider_ref: string;
  created_at: string;
  captured_at?: string;
}

// §4 In-app variations — extra work approved by the customer before it proceeds.
export type VariationStatus = "proposed" | "approved" | "declined";

export interface Variation {
  id: string;
  job_id: string;
  booking_id: string;
  tradie_id: string;
  amount: number; // additional cents, GST-inclusive
  reason: string;
  status: VariationStatus;
  created_at: string;
}

export interface LicenceVerification {
  id: string;
  tradie_id: string;
  state: AustralianState;
  licence_number: string;
  checked_at: string;
  result: VerifiedStatus;
  method: "manual" | "api";
}
