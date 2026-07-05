/**
 * The data layer (§5). Collections are Map-compatible (`KVMap`): with no DB they
 * are native in-memory Maps (tests, and running without persistence); given a
 * better-sqlite3 database they are SqlMaps, so all state is durable across
 * restarts. Services depend only on the KVMap surface, not on the storage.
 *
 * Audit logs (overrideLog / leakageLog) and demoAccountIds stay in-memory —
 * the logs are diagnostic and demo ids are re-seeded on every boot.
 *
 * The name stays `MemoryStore` for continuity; pass a `Database` to persist.
 */
import type Database from "better-sqlite3";
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
import { SqlMap, type KVMap } from "./kvMap.js";

export class MemoryStore {
  users: KVMap<string, User>;
  homeowners: KVMap<string, HomeownerProfile>; // key: user_id
  tradies: KVMap<string, TradieProfile>; // key: user_id
  jobs: KVMap<string, Job>;
  triages: KVMap<string, Triage>; // key: triage id
  triageByJob: KVMap<string, string>; // job_id -> triage id
  quotes: KVMap<string, Quote>;
  threads: KVMap<string, MessageThread>;
  messages: KVMap<string, Message>;
  bookings: KVMap<string, Booking>;
  reviews: KVMap<string, Review>;
  licenceVerifications: KVMap<string, LicenceVerification>;
  /** Auth: user_id -> password hash, and lowercased email -> user_id. */
  credentials: KVMap<string, string>;
  usersByEmail: KVMap<string, string>;
  /** user_id -> display name (person's name, distinct from business_name). */
  displayNames: KVMap<string, string>;

  /** Seeded demo accounts eligible for one-click demo login (re-seeded per boot). */
  demoAccountIds = new Set<string>();
  /** §1.7 override audit log — every gate override lands here for review. */
  overrideLog: Array<{ triage_id: string; job_id: string; at: string; overrides: Triage["overrides"] }> = [];
  /** §9 leakage attempt log. */
  leakageLog: Array<{ thread_id: string; sender_role: string; at: string }> = [];

  constructor(db?: Database.Database) {
    const mk = <V>(table: string): KVMap<string, V> =>
      db ? new SqlMap<V>(db, table) : new Map<string, V>();
    this.users = mk("users");
    this.homeowners = mk("homeowners");
    this.tradies = mk("tradies");
    this.jobs = mk("jobs");
    this.triages = mk("triages");
    this.triageByJob = mk("triage_by_job");
    this.quotes = mk("quotes");
    this.threads = mk("threads");
    this.messages = mk("messages");
    this.bookings = mk("bookings");
    this.reviews = mk("reviews");
    this.licenceVerifications = mk("licence_verifications");
    this.credentials = mk("credentials");
    this.usersByEmail = mk("users_by_email");
    this.displayNames = mk("display_names");
  }

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
