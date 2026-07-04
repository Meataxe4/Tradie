// Thin typed API client. Sends the session token as a Bearer Authorization
// header. Token + identity are cached in localStorage.
import type {
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
  RegisterInput,
  WonLead,
} from "./types";

const KEY_ID = "squiz.identity";
const KEY_TOKEN = "squiz.token";

export function getIdentity(): Identity | null {
  const raw = localStorage.getItem(KEY_ID);
  return raw ? (JSON.parse(raw) as Identity) : null;
}
export function setIdentity(id: Identity | null) {
  if (id) localStorage.setItem(KEY_ID, JSON.stringify(id));
  else localStorage.removeItem(KEY_ID);
}
export function getToken(): string | null {
  return localStorage.getItem(KEY_TOKEN);
}
export function setToken(token: string | null) {
  if (token) localStorage.setItem(KEY_TOKEN, token);
  else localStorage.removeItem(KEY_TOKEN);
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
  if (!res.ok) {
    let message = res.statusText;
    try {
      const data = await res.json();
      if (data?.error) message = data.error;
    } catch {
      /* ignore */
    }
    // A dead/expired token: drop it so the app returns to the sign-in screen.
    if (res.status === 401) { setToken(null); setIdentity(null); }
    throw new ApiError(res.status, message);
  }
  if (res.status === 204) return undefined as T;
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

  // tradie
  leads: () => req<Lead[]>("GET", "/leads"),
  lead: (id: string) => req<Lead>("GET", `/leads/${id}`),
  submitQuote: (
    jobId: string,
    input: { amount: number; inclusions: string; earliest_availability?: string },
  ) => req<{ quote_id: string; status: string; thread_id: string }>("POST", `/jobs/${jobId}/quotes`, input),
  myQuotes: () => req<MyQuote[]>("GET", "/me/quotes"),
  wonLeads: () => req<WonLead[]>("GET", "/me/leads/won"),

  // shared
  messages: (threadId: string) => req<Message[]>("GET", `/threads/${threadId}/messages`),
  sendMessage: (threadId: string, bodyText: string) =>
    req<Message>("POST", `/threads/${threadId}/messages`, { body: bodyText }),
  completeBooking: (id: string) => req<Booking>("POST", `/bookings/${id}/complete`),
  review: (bookingId: string, rating: number, text: string) =>
    req<unknown>("POST", `/bookings/${bookingId}/review`, { rating, text }),
};
