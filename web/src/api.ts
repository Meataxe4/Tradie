// Thin typed API client. Sends the session token as a Bearer Authorization
// header. Token + identity are cached in localStorage.
import type {
  AdminOverview,
  AuthResult,
  Booking,
  CreateJobResponse,
  Identity,
  JobDetail,
  JobSummary,
  Lead,
  Message,
  MyQuote,
  Quote,
  QuoteDraft,
  QuoteExplanation,
  RegisterInput,
  ReplySuggestion,
  Review,
  ReviewResponseDraft,
  TradieSummary,
  VariationDraft,
  WonLead,
} from "./types";
import { storage } from "./storage";

const KEY_ID = "squiz.identity";
const KEY_TOKEN = "squiz.token";

export function getIdentity(): Identity | null {
  const raw = storage.get(KEY_ID);
  try { return raw ? (JSON.parse(raw) as Identity) : null; } catch { return null; }
}
export function setIdentity(id: Identity | null) {
  if (id) storage.set(KEY_ID, JSON.stringify(id));
  else storage.remove(KEY_ID);
}
export function getToken(): string | null {
  return storage.get(KEY_TOKEN);
}
export function setToken(token: string | null) {
  if (token) storage.set(KEY_TOKEN, token);
  else storage.remove(KEY_TOKEN);
}
/** Persist a successful auth result (token + identity) in one place. */
export function storeAuth(result: AuthResult) {
  setToken(result.token);
  setIdentity({ id: result.user.id, role: result.user.role, label: result.user.name });
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers["authorization"] = `Bearer ${token}`;
  const res = await fetch(`/api${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const contentType = res.headers.get("content-type") ?? "";
  const isJson = contentType.includes("application/json");

  if (!res.ok) {
    let message = res.statusText;
    if (isJson) {
      try {
        const data = await res.json();
        if (data?.error) message = data.error;
      } catch {
        /* ignore */
      }
    }
    // A dead/expired token: drop it so the app returns to the sign-in screen.
    if (res.status === 401) { setToken(null); setIdentity(null); }
    throw new ApiError(res.status, message);
  }
  if (res.status === 204) return undefined as T;

  // A non-JSON 200 means the request hit the SPA fallback (index.html), not the
  // API — usually a stale/missing web build or the API being unreachable. Give a
  // clear message instead of a raw "Unexpected token '<'" JSON-parse error.
  if (!isJson) {
    throw new ApiError(
      res.status,
      "The server returned the app page instead of data. The API isn't reachable at this URL — " +
        "rebuild the frontend (npm run build:web) and restart, or run `npm run dev`.",
    );
  }
  return (await res.json()) as T;
}

export const api = {
  // auth
  register: (input: RegisterInput) => req<AuthResult>("POST", "/auth/register", input),
  login: (email: string, password: string) => req<AuthResult>("POST", "/auth/login", { email, password }),
  demoLogin: (id: string) => req<AuthResult>("POST", `/auth/demo/${id}`),
  identities: () => req<Identity[]>("GET", "/demo/identities"),

  // homeowner
  createJob: (input: {
    description: string;
    photos: string[];
    captions?: string[];
    suburb: string;
    postcode: string;
    state: string;
    full_address?: string;
  }) => req<CreateJobResponse>("POST", "/jobs", input),
  myJobs: () => req<JobSummary[]>("GET", "/jobs"),
  job: (id: string) => req<JobDetail>("GET", `/jobs/${id}`),
  jobQuotes: (id: string) => req<Quote[]>("GET", `/jobs/${id}/quotes`),
  acceptQuote: (id: string) =>
    req<{ quote: Quote; booking: Booking }>("POST", `/quotes/${id}/accept`),
  declineReassign: (id: string) =>
    req<{ job: JobSummary; assigned_tradie: TradieSummary | null }>("POST", `/quotes/${id}/decline-reassign`),
  explainQuote: (quoteId: string) => req<QuoteExplanation>("POST", `/quotes/${quoteId}/explain`),

  // tradie
  leads: () => req<Lead[]>("GET", "/leads"),
  lead: (id: string) => req<Lead>("GET", `/leads/${id}`),
  submitQuote: (
    jobId: string,
    input: { amount: number; inclusions: string; earliest_availability?: string },
  ) => req<{ quote_id: string; status: string; thread_id: string }>("POST", `/jobs/${jobId}/quotes`, input),
  draftQuote: (jobId: string) => req<QuoteDraft>("POST", `/leads/${jobId}/draft-quote`),
  draftVariation: (bookingId: string, foundNote: string) =>
    req<VariationDraft>("POST", `/bookings/${bookingId}/draft-variation`, { found_note: foundNote }),
  draftReviewResponse: (reviewId: string) =>
    req<ReviewResponseDraft>("POST", `/reviews/${reviewId}/draft-response`),
  respondToReview: (reviewId: string, response: string) =>
    req<Review>("POST", `/reviews/${reviewId}/respond`, { response }),
  myQuotes: () => req<MyQuote[]>("GET", "/me/quotes"),
  wonLeads: () => req<WonLead[]>("GET", "/me/leads/won"),

  // shared
  messages: (threadId: string) => req<Message[]>("GET", `/threads/${threadId}/messages`),
  sendMessage: (threadId: string, bodyText: string) =>
    req<Message>("POST", `/threads/${threadId}/messages`, { body: bodyText }),
  suggestReply: (threadId: string) =>
    req<ReplySuggestion>("POST", `/threads/${threadId}/suggest-reply`),
  completeBooking: (id: string) => req<Booking>("POST", `/bookings/${id}/complete`),
  review: (bookingId: string, overall: number, dimensions: Record<string, number>, text: string) =>
    req<unknown>("POST", `/bookings/${bookingId}/review`, { overall, dimensions, text }),

  // admin ops dashboard
  adminOverview: () => req<AdminOverview>("GET", "/admin/overview"),
  verifyTradie: (id: string) => req<unknown>("POST", `/admin/tradies/${id}/verify`),

  // variations (§4)
  proposeVariation: (bookingId: string, amount: number, reason: string) =>
    req<unknown>("POST", `/bookings/${bookingId}/variations`, { amount, reason }),
  approveVariation: (id: string) => req<unknown>("POST", `/variations/${id}/approve`),
  declineVariation: (id: string) => req<unknown>("POST", `/variations/${id}/decline`),
};
