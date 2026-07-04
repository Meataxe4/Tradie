/**
 * Minimal in-memory data layer for the MVP. Single source of truth for all
 * entities (§5). Swap for a real DB (Postgres/Prisma) later — the API and
 * services only depend on these methods, not on the storage.
 */
import type {
  Booking,
  HomeownerProfile,
  Job,
  LicenceVerification,
  Message,
  MessageThread,
  Quote,
  Review,
  TradieProfile,
  Triage,
  User,
} from "../domain/entities.js";

export class MemoryStore {
  users = new Map<string, User>();
  homeowners = new Map<string, HomeownerProfile>(); // key: user_id
  tradies = new Map<string, TradieProfile>(); // key: user_id
  jobs = new Map<string, Job>();
  triages = new Map<string, Triage>(); // key: triage id
  triageByJob = new Map<string, string>(); // job_id -> triage id
  quotes = new Map<string, Quote>();
  threads = new Map<string, MessageThread>();
  messages = new Map<string, Message>();
  bookings = new Map<string, Booking>();
  reviews = new Map<string, Review>();
  licenceVerifications = new Map<string, LicenceVerification>();
  /** §1.7 override audit log — every gate override lands here for review. */
  overrideLog: Array<{ triage_id: string; job_id: string; at: string; overrides: Triage["overrides"] }> = [];
  /** §9 leakage attempt log. */
  leakageLog: Array<{ thread_id: string; sender_role: string; at: string }> = [];

  quotesForJob(jobId: string): Quote[] {
    return [...this.quotes.values()].filter((q) => q.job_id === jobId);
  }

  messagesForThread(threadId: string): Message[] {
    return [...this.messages.values()]
      .filter((m) => m.thread_id === threadId)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
  }

  allTradies(): TradieProfile[] {
    return [...this.tradies.values()];
  }
}
