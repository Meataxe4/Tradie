/**
 * §5 Data model — entities and key fields. Kept as plain TypeScript types; the
 * in-memory store (store/memoryStore.ts) holds instances. Swap the store for a
 * real DB later without changing these shapes.
 */
import type { Category, TriageResult, Verdict } from "../triage/schema.js";
import type { Override } from "../triage/gate.js";

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

// §6 Job state machine.
export type JobStatus =
  | "DRAFT"
  | "TRIAGED"
  | "DIY_RESOLVED"
  | "POSTED"
  | "QUOTING"
  | "QUOTE_ACCEPTED"
  | "BOOKED"
  | "COMPLETED"
  | "REVIEWED"
  | "CANCELLED"
  | "EXPIRED";

export interface Job {
  id: string;
  homeowner_id: string;
  category: Category;
  description: string;
  photos: string[]; // opaque refs
  suburb: string;
  postcode: string;
  state: AustralianState;
  /** Revealed to the winning tradie only, on BOOKED (§9). */
  full_address?: string;
  urgency: Urgency;
  status: JobStatus;
  created_at: string;
}

export interface Triage {
  id: string;
  job_id: string;
  result: TriageResult; // full §2 JSON (post-gate)
  model_verdict: Verdict;
  final_verdict: Verdict;
  overrides: Override[];
  created_at: string;
}

// §6 Quote state machine.
export type QuoteStatus =
  | "submitted"
  | "accepted"
  | "declined"
  | "withdrawn"
  | "expired";

export interface Quote {
  id: string;
  job_id: string;
  tradie_id: string;
  amount: number; // AUD cents
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

export interface Review {
  id: string;
  booking_id: string;
  rating: number; // 1..5
  text: string;
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
