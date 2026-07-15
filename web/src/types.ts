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
  vision?: VisionSummary | null;
  booking: Booking | null;
  payment: Payment | null;
  variations: Variation[];
  reviews: Review[];
  assigned_tradie?: TradieSummary | null;
  ballpark?: { low: number; high: number } | null;
  project_id?: string;
  stage_index?: number;
  stage_label?: string;
  certificate?: JobCertificate | null;
}

export interface HomeProfile {
  user_id?: string;
  suburb?: string;
  postcode?: string;
  state?: string;
  default_address?: string;
  property?: { build_era?: string; dwelling?: string };
}

export interface VisionSummary {
  photos: number;
  captions: number;
  analyzed: boolean;
  mode: "live" | "preview" | "none";
}

export interface JobCertificate {
  name: string;
  reference: string;
  lodged_at: string;
}

export interface ProjectStage {
  stage_index: number;
  stage_label: string;
  job_id: string;
  category: string;
  status: string;
  quote_amount: number | null;
  ballpark: { low: number; high: number } | null;
  certificate: JobCertificate | null;
  certificate_required: string | null;
}

export interface ProjectView {
  id: string;
  title: string;
  kind: "multi_trade" | "custom";
  created_at: string;
  stages: ProjectStage[];
  firm_total: number;
  all_priced: boolean;
}

export interface CreateJobResponse {
  job: JobSummary;
  triage: TriageResult;
  overrides: Override[];
  model_verdict: Verdict;
  assigned_tradie: TradieSummary | null;
  quote: Quote | null;
  vision: VisionSummary;
  ballpark: { low: number; high: number } | null;
  project: ProjectView | null;
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
  response?: string;
  responded_at?: string;
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

export interface QuoteLineItem {
  label: string;
  amount: number;
}

export interface QuoteDraft {
  suggested_amount: number;
  line_items: QuoteLineItem[];
  scope_of_work: string;
  customer_message: string;
  assumptions: string[];
  source: "assistant" | "claude";
}

export interface VariationDraft {
  amount: number;
  reason: string;
  customer_message: string;
  source: "assistant" | "claude";
}

export interface QuoteExplanation {
  plain_summary: string;
  what_youre_paying_for: string[];
  questions_to_ask: string[];
  source: "assistant" | "claude";
}

export interface ReplySuggestion {
  suggestion: string;
  source: "assistant" | "claude";
}

export interface ReviewResponseDraft {
  response: string;
  source: "assistant" | "claude";
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
  vision?: VisionSummary | null;
  stage_label?: string | null;
  stage_index?: number | null;
  certificate?: JobCertificate | null;
  certificate_required?: { name: string; window: string } | null;
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
  created_at?: string;
  completion_requested_at?: string;
  completion_requested_by?: "tradie" | "homeowner";
  auto_release_at?: string;
  disputed_at?: string;
  dispute_reason?: string;
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

// ---- admin ops dashboard ----
export interface AdminOverview {
  stats: {
    gmv: number;
    revenue: number;
    held: number;
    jobs_posted: number;
    diy_resolved: number;
    declined: number;
    acceptance_rate: number | null;
    tradies_total: number;
    tradies_verified: number;
  };
  funnel: Array<{ key: string; label: string; count: number }>;
  attention: Array<{
    kind: "disputed" | "stale";
    booking: Booking;
    job: { id: string; description: string; category: string } | null;
    tradie: TradieSummary | null;
    payment: Payment | null;
  }>;
  overrides: Array<{ triage_id: string; job_id: string; at: string; overrides: Override[] }>;
  leakage: Array<{ thread_id: string; sender_role: string; at: string }>;
  verification: Array<{
    user_id: string;
    business_name: string;
    abn: string;
    trades: string[];
    verified_status: string;
    licences: Array<{ class: string; number: string; state: string; verified_status: string }>;
  }>;
}
