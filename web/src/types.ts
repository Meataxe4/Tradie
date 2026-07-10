// Shapes mirrored from the backend responses (a pragmatic subset).

export type Role = "homeowner" | "tradie" | "admin";

export type Verdict =
  | "DIY_SAFE"
  | "NEEDS_LICENSED_PRO"
  | "EMERGENCY_STOP"
  | "UNCLEAR";

export interface Identity {
  id: string;
  role: Role;
  label: string;
}

export interface AuthResult {
  token: string;
  user: { id: string; role: Role; email: string; name: string };
}

export interface RegisterInput {
  email: string;
  password: string;
  name: string;
  role: "homeowner" | "tradie";
  suburb?: string;
  postcode?: string;
  business_name?: string;
  abn?: string;
  trades?: string[];
  state?: string;
  service_postcodes?: string[];
  licence_class?: string;
  licence_number?: string;
}

export interface DiyGuidance {
  steps: string[];
  tools_required: string[];
  stop_conditions: string[];
}

export interface JobSpec {
  title: string;
  summary: string;
  symptoms: string[];
  access_notes: string;
  questions_for_site_visit: string[];
  urgency: "emergency" | "urgent" | "routine";
  photos_attached: boolean;
}

export interface TriageResult {
  triage_id: string;
  verdict: Verdict;
  confidence: "low" | "medium" | "high";
  category: string;
  regulated_domains: string[];
  safety_flags: string[];
  recommended_trade: string;
  required_licence_class: string | null;
  clarifying_questions: string[];
  diy_guidance: DiyGuidance | null;
  why_pro_needed: string | null;
  job_spec: JobSpec | null;
  user_message: string;
  disclaimer: string;
}

export interface Override {
  reason: string;
  from_verdict: Verdict;
  to_verdict: Verdict;
  detail: string;
}

export interface JobSummary {
  id: string;
  category: string;
  description: string;
  suburb: string;
  postcode: string;
  status: string;
  urgency: string;
  created_at: string;
  verdict: Verdict | null;
  quote_count: number;
}

export interface Payment {
  status: "authorized" | "captured" | "canceled" | "failed";
  amount_authorized: number;
  amount_captured?: number;
  platform_fee?: number;
  trade_payout?: number;
  currency: string;
  captured_at?: string;
}

export interface Variation {
  id: string;
  amount: number;
  reason: string;
  status: "proposed" | "approved" | "declined";
  created_at: string;
}

export interface JobDetail extends JobSummary {
  photos: string[];
  full_address?: string;
  triage: TriageResult | null;
  booking: Booking | null;
  payment: Payment | null;
  variations: Variation[];
  reviews: Review[];
}

export interface CreateJobResponse {
  job: JobSummary;
  triage: TriageResult;
  overrides: Override[];
  model_verdict: Verdict;
  assigned_tradie: TradieSummary | null;
  quote: Quote | null;
}

export interface TradieSummary {
  tradie_id: string;
  business_name: string;
  rating_avg: number;
  jobs_completed: number;
  response_minutes: number | null;
  verified: boolean;
  licence_class: string | null;
  licence_verified: boolean;
  insured: boolean;
  member_since: string | null;
  strengths: string[];
}

export interface Review {
  id: string;
  rater_role: "homeowner" | "tradie";
  overall: number;
  dimensions: Record<string, number>;
  text: string;
  created_at: string;
}

export interface Quote {
  quote_id: string;
  job_id: string;
  tradie: TradieSummary | null;
  kind?: "price_book" | "custom";
  amount: number;
  inclusions: string;
  earliest_availability?: string;
  status: string;
  created_at: string;
}

export interface Lead {
  job_id: string;
  category: string;
  suburb: string;
  full_address: string | null;
  urgency: string;
  status: string;
  job_spec: JobSpec | null;
  why_pro_needed: string | null;
  required_licence_class: string | null;
  photos: string[];
  created_at: string;
  quote_count: number;
  quote_kind: "price_book" | "custom" | null;
  assigned_to_me: boolean;
  poster: { suburb: string; member_since: string | null; verified: boolean };
  my_quote: Quote | null;
}

export interface Message {
  id: string;
  thread_id: string;
  sender_role: "homeowner" | "tradie";
  body: string;
  redacted: boolean;
  created_at: string;
}

export interface Booking {
  id: string;
  job_id: string;
  quote_id: string;
  tradie_id: string;
  status: string;
  scheduled_for?: string;
}

export interface WonLead {
  booking: Booking;
  thread_id: string;
  job: Lead | null;
  payment: Payment | null;
  variations: Variation[];
  reviews: Review[];
}

export interface MyQuote extends Quote {
  thread_id: string;
  job: Lead | null;
}
