/**
 * §8 API surface. Express app factory with the store, triage and marketplace
 * services injected so it can be constructed in tests without a network model.
 *
 * Auth is an MVP stub: callers set `x-user-id` and `x-user-role` headers. Wire
 * real auth (JWT/session) at v1 — the route guards already read role/identity
 * through one helper so there's a single place to swap.
 */
import express, { type Request, type Response, type NextFunction } from "express";
import { MemoryStore } from "../store/memoryStore.js";
import { MarketplaceService } from "../services/marketplaceService.js";
import { TriageService } from "../triage/triageService.js";
import type { TriageLlmClient } from "../triage/llmClient.js";
import { matchTradies } from "../domain/matching.js";
import {
  homeownerJobView,
  leadView,
  quoteView,
} from "./views.js";
import type { Role } from "../domain/entities.js";

export interface AppDeps {
  store: MemoryStore;
  llm: TriageLlmClient;
  clock?: () => string;
}

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function auth(req: Request): { id: string; role: Role } {
  const id = req.header("x-user-id");
  const role = req.header("x-user-role") as Role | undefined;
  if (!id || !role) throw new HttpError(401, "Missing x-user-id / x-user-role");
  return { id, role };
}

function requireRole(req: Request, ...roles: Role[]) {
  const user = auth(req);
  if (!roles.includes(user.role)) {
    throw new HttpError(403, `Requires role: ${roles.join(" or ")}`);
  }
  return user;
}

/** Read a required path param (typed as possibly-undefined under strict index checks). */
function param(req: Request, name: string): string {
  const value = req.params[name];
  if (!value) throw new HttpError(400, `Missing path parameter: ${name}`);
  return value;
}

export function createApp(deps: AppDeps) {
  const { store } = deps;
  const clock = deps.clock ?? (() => new Date().toISOString());
  const triageSvc = new TriageService({ llm: deps.llm, clock });
  const market = new MarketplaceService(store, triageSvc, clock);

  const app = express();
  app.use(express.json({ limit: "2mb" }));

  const wrap =
    (fn: (req: Request, res: Response) => Promise<void> | void) =>
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        await fn(req, res);
      } catch (err) {
        next(err);
      }
    };

  app.get("/health", (_req, res) => res.json({ ok: true }));

  // ---- auth / me ----
  app.get("/me", wrap((req, res) => {
    const user = auth(req);
    const stored = store.users.get(user.id);
    res.json({ id: user.id, role: user.role, profile: stored ?? null });
  }));

  // ---- Homeowner ----
  // POST /jobs — create job (description, photos, location) → triggers triage.
  app.post("/jobs", wrap(async (req, res) => {
    const user = requireRole(req, "homeowner");
    const b = req.body ?? {};
    if (!b.description || !b.suburb || !b.postcode || !b.state) {
      throw new HttpError(400, "description, suburb, postcode and state are required");
    }
    const result = await market.createJob({
      homeowner_id: user.id,
      description: String(b.description),
      photos: Array.isArray(b.photos) ? b.photos : [],
      suburb: String(b.suburb),
      postcode: String(b.postcode),
      state: b.state,
      full_address: b.full_address,
      category: b.category,
    });
    res.status(201).json({
      job: result.job,
      triage: result.triage.result,
      matched_tradies: result.matched.map((m) => m.tradie.user_id),
    });
  }));

  // GET /jobs/:id — homeowner's own job incl. triage + DIY guidance.
  app.get("/jobs/:id", wrap((req, res) => {
    const user = requireRole(req, "homeowner", "admin");
    const job = store.jobs.get(param(req, "id"));
    if (!job) throw new HttpError(404, "Job not found");
    if (user.role !== "admin" && job.homeowner_id !== user.id) {
      throw new HttpError(403, "Not your job");
    }
    const triageId = store.triageByJob.get(job.id);
    const triage = triageId ? store.triages.get(triageId) : undefined;
    res.json(homeownerJobView(job, triage));
  }));

  // GET /jobs/:id/quotes — private quote list (homeowner only).
  app.get("/jobs/:id/quotes", wrap((req, res) => {
    const user = requireRole(req, "homeowner");
    const job = store.jobs.get(param(req, "id"));
    if (!job) throw new HttpError(404, "Job not found");
    if (job.homeowner_id !== user.id) throw new HttpError(403, "Not your job");
    res.json(store.quotesForJob(job.id).map((q) => quoteView(q, store)));
  }));

  // POST /quotes/:id/accept — accept, auto-decline rest, reveal address, book.
  app.post("/quotes/:id/accept", wrap((req, res) => {
    const user = requireRole(req, "homeowner");
    const quote = store.quotes.get(param(req, "id"));
    if (!quote) throw new HttpError(404, "Quote not found");
    const job = store.jobs.get(quote.job_id);
    if (!job || job.homeowner_id !== user.id) throw new HttpError(403, "Not your job");
    const out = market.acceptQuote(quote.id);
    res.json({ quote: quoteView(out.quote, store), booking: out.booking });
  }));

  // ---- Tradie ----
  // GET /leads — matched jobs, homeowner masked.
  app.get("/leads", wrap((req, res) => {
    const user = requireRole(req, "tradie");
    const tradie = store.tradies.get(user.id);
    if (!tradie) throw new HttpError(404, "Tradie profile not found");
    const now = clock();
    const leads = [...store.jobs.values()]
      .filter((j) => j.status === "POSTED" || j.status === "QUOTING")
      .filter((j) => {
        const triageId = store.triageByJob.get(j.id);
        const triage = triageId ? store.triages.get(triageId) : undefined;
        if (!triage) return false;
        return (
          matchTradies(j, triage.result, [tradie], { now, cap: 1 }).length > 0
        );
      })
      .map((j) => leadView(store, j, user.id));
    res.json(leads);
  }));

  // GET /leads/:id — job spec + photos (masked).
  app.get("/leads/:id", wrap((req, res) => {
    const user = requireRole(req, "tradie");
    const job = store.jobs.get(param(req, "id"));
    if (!job) throw new HttpError(404, "Lead not found");
    res.json(leadView(store, job, user.id));
  }));

  // POST /jobs/:id/quotes — submit a sealed quote.
  app.post("/jobs/:id/quotes", wrap((req, res) => {
    const user = requireRole(req, "tradie");
    const b = req.body ?? {};
    if (typeof b.amount !== "number") throw new HttpError(400, "amount (number, AUD cents) required");
    const quote = market.submitQuote({
      job_id: param(req, "id"),
      tradie_id: user.id,
      amount: b.amount,
      inclusions: String(b.inclusions ?? ""),
      earliest_availability: b.earliest_availability,
    });
    // Return the tradie's own quote only — never other tradies' sealed quotes.
    res.status(201).json({ quote_id: quote.id, status: quote.status, thread_id: quote.id });
  }));

  // GET /me/leads/won — bookings won by this tradie.
  app.get("/me/leads/won", wrap((req, res) => {
    const user = requireRole(req, "tradie");
    const won = [...store.bookings.values()]
      .filter((bk) => bk.tradie_id === user.id)
      .map((bk) => {
        const job = store.jobs.get(bk.job_id);
        return { booking: bk, job: job ? leadView(store, job, user.id) : null };
      });
    res.json(won);
  }));

  // ---- Shared: messaging, bookings, reviews ----
  // POST /threads/:id/messages — masked in-app chat (§9).
  app.post("/threads/:id/messages", wrap((req, res) => {
    const user = requireRole(req, "homeowner", "tradie");
    const thread = store.threads.get(param(req, "id"));
    if (!thread) throw new HttpError(404, "Thread not found");
    const b = req.body ?? {};
    if (!b.body) throw new HttpError(400, "body required");
    const msg = market.postMessage({
      thread_id: param(req, "id"),
      sender_role: user.role === "tradie" ? "tradie" : "homeowner",
      body: String(b.body),
    });
    res.status(201).json(msg);
  }));

  app.get("/threads/:id/messages", wrap((req, res) => {
    requireRole(req, "homeowner", "tradie");
    if (!store.threads.get(param(req, "id"))) throw new HttpError(404, "Thread not found");
    res.json(store.messagesForThread(param(req, "id")));
  }));

  // POST /bookings/:id/complete
  app.post("/bookings/:id/complete", wrap((req, res) => {
    requireRole(req, "homeowner", "tradie", "admin");
    const booking = store.bookings.get(param(req, "id"));
    if (!booking) throw new HttpError(404, "Booking not found");
    res.json(market.completeBooking(booking.id));
  }));

  // POST /bookings/:id/review — only after a completed booking.
  app.post("/bookings/:id/review", wrap((req, res) => {
    requireRole(req, "homeowner");
    const b = req.body ?? {};
    const review = market.reviewBooking({
      booking_id: param(req, "id"),
      rating: Number(b.rating),
      text: String(b.text ?? ""),
    });
    res.status(201).json(review);
  }));

  // POST /triage — internal: run triage without persisting a job (§8 shared).
  app.post("/triage", wrap(async (req, res) => {
    requireRole(req, "admin");
    const b = req.body ?? {};
    const outcome = await triageSvc.triage({
      description: String(b.description ?? ""),
      photoCount: Array.isArray(b.photos) ? b.photos.length : 0,
      suburb: b.suburb,
    });
    res.json({
      triage: outcome.gate.triage,
      model_verdict: outcome.gate.model_verdict,
      overrides: outcome.gate.overrides,
      failed_closed: outcome.failedClosed,
    });
  }));

  // ---- Admin ----
  app.get("/admin/override-log", wrap((req, res) => {
    requireRole(req, "admin");
    res.json(store.overrideLog);
  }));

  app.get("/admin/leakage-log", wrap((req, res) => {
    requireRole(req, "admin");
    res.json(store.leakageLog);
  }));

  app.get("/admin/verification-queue", wrap((req, res) => {
    requireRole(req, "admin");
    const pending = store.allTradies().filter(
      (t) => t.verified_status === "pending" || t.verified_status === "unverified",
    );
    res.json(pending);
  }));

  // ---- error handler ----
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: err.message });
    } else {
      const message = err instanceof Error ? err.message : "Internal error";
      res.status(400).json({ error: message });
    }
  });

  return app;
}
