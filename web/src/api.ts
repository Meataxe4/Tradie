// Thin typed API client. Reads the current identity from localStorage and
// sends it as the x-user-id / x-user-role headers the backend expects.
import type {
  Booking,
  CreateJobResponse,
  Identity,
  JobDetail,
  JobSummary,
  Lead,
  Message,
  MyQuote,
  Quote,
  WonLead,
} from "./types";

const KEY = "squiz.identity";

export function getIdentity(): Identity | null {
  const raw = localStorage.getItem(KEY);
  return raw ? (JSON.parse(raw) as Identity) : null;
}
export function setIdentity(id: Identity | null) {
  if (id) localStorage.setItem(KEY, JSON.stringify(id));
  else localStorage.removeItem(KEY);
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const id = getIdentity();
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (id) {
    headers["x-user-id"] = id.id;
    headers["x-user-role"] = id.role;
  }
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
    throw new ApiError(res.status, message);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
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
