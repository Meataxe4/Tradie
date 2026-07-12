/**
 * §8 API surface. Express app factory with the store, triage and marketplace
 * services injected so it can be constructed in tests without a network model.
 *
 * All API routes are mounted under `/api`. When `staticDir` is supplied, the
 * built web frontend is served from the same origin (so there is no CORS in
 * production and client-side routing falls back to index.html).
 *
 * Auth is an MVP stub: callers set `x-user-id` and `x-user-role` headers. Wire
 * real auth (JWT/session) at v1 — the route guards already read role/identity
 * through one helper so there's a single place to swap.
 */
import express, { Router, type Request, type Response, type NextFunction } from "express";
import { MemoryStore } from "../store/memoryStore.js";
import { MarketplaceService } from "../services/marketplaceService.js";
import { TriageService } from "../triage/triageService.js";
import type { TriageLlmClient } from "../triage/llmClient.js";
import { homeownerJobView, leadView, quoteView, tradieSummary } from "./views.js";
import type { Role } from "../domain/entities.js";
import { AuthService, AuthError } from "../auth/authService.js";
import { verifyToken, TokenError } from "../auth/tokens.js";
import { estimateBallpark, type QuoteAssistantClient } from "../quoting/quoteAssistant.js";

export interface AppDeps {
  store: MemoryStore;
  llm: TriageLlmClient;
  clock?: () => string;
  /** Absolute path to the built web frontend (web/dist). Omit in tests. */
  staticDir?: string;
  /** HS256 signing secret for session tokens. */
  authSecret?: string;
  /** AI Quote Assistant client; defaults to the deterministic mock. */
  quoteAssistant?: QuoteAssistantClient;
}

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Read a required path param (typed as possibly-undefined under strict index checks). */
function param(req: Request, name: string): string {
  const value = req.params[name];
  if (!value) throw new HttpError(400, `Missing path parameter: ${name}`);
  return value;
}

/** Parse `data:image/jpeg;base64,XXXX` photo refs into vision image blocks. */
function parseImages(photos: unknown): Array<{ media_type: string; data: string }> {
  if (!Array.isArray(photos)) return [];
  const out: Array<{ media_type: string; data: string }> = [];
  for (const p of photos) {
    const m = typeof p === "string" && p.match(/^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i);
    if (m) out.push({ media_type: m[1]!, data: m[2]! });
  }
  return out;
}

export function createApp(deps: AppDeps) {
  const { store } = deps;
  const clock = deps.clock ?? (() => new Date().toISOString());
  const secret = deps.authSecret ?? "dev-insecure-secret-change-in-production";
  const triageSvc = new TriageService({ llm: deps.llm, clock });
  const market = new MarketplaceService(store, triageSvc, clock, undefined, deps.quoteAssistant);
  const authSvc = new AuthService(store, secret);

  // Session identity from the Bearer token.
  const auth = (req: Request): { id: string; role: Role } => {
    const header = req.header("authorization");
    if (!header?.startsWith("Bearer ")) throw new HttpError(401, "Sign in to continue");
    try {
      const payload = verifyToken(header.slice(7), secret);
      return { id: payload.sub, role: payload.role as Role };
    } catch (err) {
      if (err instanceof TokenError) throw new HttpError(401, "Session expired — please sign in again");
      throw err;
    }
  };

  const requireRole = (req: Request, ...roles: Role[]) => {
    const user = auth(req);
    if (!roles.includes(user.role)) {
      throw new HttpError(403, `Requires role: ${roles.join(" or ")}`);
    }
    return user;
  };

  const app = express();
  app.use(express.json({ limit: "2mb" }));

  const api = Router();

  const wrap =
    (fn: (req: Request, res: Response) => Promise<void> | void) =>
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        await fn(req, res);
      } catch (err) {
        next(err);
      }
    };

  api.get("/health", (_req, res) => res.json({ ok: true }));

  // ---- auth ----
  api.post("/auth/register", wrap((req, res) => {
    const b = req.body ?? {};
    const result = authSvc.register({
      email: String(b.email ?? ""),
      password: String(b.password ?? ""),
      name: String(b.name ?? ""),
      role: b.role === "tradie" ? "tradie" : "homeowner",
      phone: b.phone,
      suburb: b.suburb,
      postcode: b.postcode,
      business_name: b.business_name,
      abn: b.abn,
      trades: Array.isArray(b.trades) ? b.trades : undefined,
      state: b.state,
      service_postcodes: Array.isArray(b.service_postcodes) ? b.service_postcodes : undefined,
      licence_class: b.licence_class,
      licence_number: b.licence_number,
    });
    res.status(201).json(result);
  }));

  api.post("/auth/login", wrap((req, res) => {
    const b = req.body ?? {};
    res.json(authSvc.login(String(b.email ?? ""), String(b.password ?? "")));
  }));

  // One-click demo login for the seeded accounts (no password).
  api.post("/auth/demo/:id", wrap((req, res) => {
    res.json(authSvc.demoLogin(param(req, "id")));
  }));

  // The seeded demo accounts, for the "try a demo account" buttons.
  api.get("/demo/identities", wrap((_req, res) => {
    const identities = [...store.demoAccountIds]
      .map((id) => store.users.get(id))
      .filter((u): u is NonNullable<typeof u> => Boolean(u) && u!.role !== "admin")
      .map((u) => ({ id: u.id, role: u.role, label: store.displayNames.get(u.id) ?? u.email }));
    res.json(identities);
  }));

  // ---- me ----
  api.get("/me", wrap((req, res) => {
    const user = auth(req);
    const profile =
      user.role === "tradie"
        ? store.tradies.get(user.id)
        : user.role === "homeowner"
          ? store.homeowners.get(user.id)
          : null;
    res.json({
      id: user.id,
      role: user.role,
      name: store.displayNames.get(user.id) ?? null,
      user: store.users.get(user.id) ?? null,
      profile: profile ?? null,
    });
  }));

  // ---- Homeowner ----
  // POST /jobs — create job (description, photos, location) → triggers triage.
  api.post("/jobs", wrap(async (req, res) => {
    const user = requireRole(req, "homeowner");
    const b = req.body ?? {};
    if (!b.description || !b.suburb || !b.postcode || !b.state) {
      throw new HttpError(400, "description, suburb, postcode and state are required");
    }
    const photos = Array.isArray(b.photos) ? b.photos : [];
    const result = await market.createJob({
      homeowner_id: user.id,
      description: String(b.description),
      photos,
      suburb: String(b.suburb),
      postcode: String(b.postcode),
      state: b.state,
      full_address: b.full_address,
      category: b.category,
      images: parseImages(photos),
      captions: Array.isArray(b.captions) ? b.captions.map(String) : undefined,
    });
    res.status(201).json({
      job: result.job,
      triage: result.triage.result,
      overrides: result.triage.overrides,
      model_verdict: result.triage.model_verdict,
      assigned_tradie: result.assigned ? tradieSummary(store, result.assigned.user_id) : null,
      quote: result.quote ? quoteView(result.quote, store) : null,
      vision: result.vision,
      ballpark: result.ballpark,
    });
  }));

  // GET /jobs — the homeowner's own jobs (most recent first).
  api.get("/jobs", wrap((req, res) => {
    const user = requireRole(req, "homeowner");
    const jobs = [...store.jobs.values()]
      .filter((j) => j.homeowner_id === user.id)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map((j) => {
        const triageId = store.triageByJob.get(j.id);
        const triage = triageId ? store.triages.get(triageId) : undefined;
        return {
          ...j,
          verdict: triage?.final_verdict ?? null,
          quote_count: store.quotesForJob(j.id).filter((q) => q.status !== "declined").length,
        };
      });
    res.json(jobs);
  }));

  // GET /jobs/:id — homeowner's own job incl. triage + DIY guidance.
  api.get("/jobs/:id", wrap((req, res) => {
    const user = requireRole(req, "homeowner", "admin");
    const job = store.jobs.get(param(req, "id"));
    if (!job) throw new HttpError(404, "Job not found");
    if (user.role !== "admin" && job.homeowner_id !== user.id) {
      throw new HttpError(403, "Not your job");
    }
    const triageId = store.triageByJob.get(job.id);
    const triage = triageId ? store.triages.get(triageId) : undefined;
    const booking = [...store.bookings.values()].find((bk) => bk.job_id === job.id) ?? null;
    const payment = booking ? market.paymentForBooking(booking.id) ?? null : null;
    const variations = booking ? market.variationsForBooking(booking.id) : [];
    const reviews = booking ? market.reviewsForBooking(booking.id) : [];
    // UX #3/#9: who's on it (waiting timeline) + typical range (over-quote note).
    const assigned_tradie = job.assigned_tradie_id ? tradieSummary(store, job.assigned_tradie_id) : null;
    const ballpark =
      job.status === "AWAITING_QUOTE" || job.status === "QUOTED"
        ? estimateBallpark(job.category, job.urgency, triage?.result.job_spec?.symptoms?.length ?? 0)
        : null;
    res.json({ ...homeownerJobView(job, triage), booking, payment, variations, reviews, assigned_tradie, ballpark });
  }));

  // POST /quotes/:id/decline-reassign — UX #9: keep the job, get the next trade.
  api.post("/quotes/:id/decline-reassign", wrap((req, res) => {
    const user = requireRole(req, "homeowner");
    const quote = store.quotes.get(param(req, "id"));
    if (!quote) throw new HttpError(404, "Quote not found");
    const job = store.jobs.get(quote.job_id);
    if (!job || job.homeowner_id !== user.id) throw new HttpError(403, "Not your job");
    const out = market.declineAndReassign(quote.id);
    res.json({
      job: out.job,
      assigned_tradie: out.assigned ? tradieSummary(store, out.assigned.user_id) : null,
    });
  }));

  // GET /jobs/:id/quotes — private quote list (homeowner only).
  api.get("/jobs/:id/quotes", wrap((req, res) => {
    const user = requireRole(req, "homeowner");
    const job = store.jobs.get(param(req, "id"));
    if (!job) throw new HttpError(404, "Job not found");
    if (job.homeowner_id !== user.id) throw new HttpError(403, "Not your job");
    res.json(store.quotesForJob(job.id).map((q) => quoteView(q, store)));
  }));

  // POST /quotes/:id/accept — accept, auto-decline rest, reveal address, book.
  api.post("/quotes/:id/accept", wrap((req, res) => {
    const user = requireRole(req, "homeowner");
    const quote = store.quotes.get(param(req, "id"));
    if (!quote) throw new HttpError(404, "Quote not found");
    const job = store.jobs.get(quote.job_id);
    if (!job || job.homeowner_id !== user.id) throw new HttpError(403, "Not your job");
    const out = market.acceptQuote(quote.id);
    res.json({ quote: quoteView(out.quote, store), booking: out.booking });
  }));

  // ---- Tradie ----
  // GET /leads — jobs ASSIGNED to this trade (§3 assigned, not auctioned), homeowner masked.
  api.get("/leads", wrap((req, res) => {
    const user = requireRole(req, "tradie");
    const tradie = store.tradies.get(user.id);
    if (!tradie) throw new HttpError(404, "Tradie profile not found");
    const ACTIVE = new Set(["AWAITING_QUOTE", "QUOTED", "BOOKED"]);
    const leads = [...store.jobs.values()]
      .filter((j) => j.assigned_tradie_id === user.id && ACTIVE.has(j.status))
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map((j) => {
        const mine = store.quotesForJob(j.id).find((q) => q.tradie_id === user.id);
        return { ...leadView(store, j, user.id), my_quote: mine ? quoteView(mine, store) : null };
      });
    res.json(leads);
  }));

  // GET /leads/:id — job spec + photos (masked).
  api.get("/leads/:id", wrap((req, res) => {
    const user = requireRole(req, "tradie");
    const job = store.jobs.get(param(req, "id"));
    if (!job) throw new HttpError(404, "Lead not found");
    const mine = store.quotesForJob(job.id).find((q) => q.tradie_id === user.id);
    res.json({ ...leadView(store, job, user.id), my_quote: mine ? quoteView(mine, store) : null });
  }));

  // POST /jobs/:id/quotes — the assigned trade returns a firm quote (custom job).
  api.post("/jobs/:id/quotes", wrap((req, res) => {
    const user = requireRole(req, "tradie");
    const b = req.body ?? {};
    if (typeof b.amount !== "number") throw new HttpError(400, "amount (number, AUD cents) required");
    const quote = market.submitFirmQuote({
      job_id: param(req, "id"),
      tradie_id: user.id,
      amount: b.amount,
      inclusions: String(b.inclusions ?? ""),
      earliest_availability: b.earliest_availability,
    });
    res.status(201).json({ quote_id: quote.id, status: quote.status, thread_id: quote.id });
  }));

  // POST /leads/:id/draft-quote — AI Quote Assistant drafts a firm quote for the
  // assigned trade (custom jobs). Returns a draft to edit; nothing is persisted.
  api.post("/leads/:id/draft-quote", wrap(async (req, res) => {
    const user = requireRole(req, "tradie");
    const draft = await market.draftQuote({ job_id: param(req, "id"), tradie_id: user.id });
    res.json(draft);
  }));

  // POST /bookings/:id/draft-variation — #1 AI-draft a variation (extra work).
  api.post("/bookings/:id/draft-variation", wrap(async (req, res) => {
    const user = requireRole(req, "tradie");
    const draft = await market.draftVariation({
      booking_id: param(req, "id"),
      tradie_id: user.id,
      found_note: String(req.body?.found_note ?? ""),
    });
    res.json(draft);
  }));

  // POST /quotes/:id/explain — #2 plain-language explanation for the homeowner.
  api.post("/quotes/:id/explain", wrap(async (req, res) => {
    const user = requireRole(req, "homeowner");
    const out = await market.explainQuote({ quote_id: param(req, "id"), homeowner_id: user.id });
    res.json(out);
  }));

  // POST /threads/:id/suggest-reply — #3 suggest a professional in-app reply.
  api.post("/threads/:id/suggest-reply", wrap(async (req, res) => {
    const user = requireRole(req, "homeowner", "tradie");
    const out = await market.suggestReply({
      thread_id: param(req, "id"),
      role: user.role === "tradie" ? "tradie" : "homeowner",
    });
    res.json(out);
  }));

  // #4 Review responses: draft, then post the trade's public reply.
  api.post("/reviews/:id/draft-response", wrap(async (req, res) => {
    const user = requireRole(req, "tradie");
    const out = await market.draftReviewResponse({ review_id: param(req, "id"), tradie_id: user.id });
    res.json(out);
  }));

  api.post("/reviews/:id/respond", wrap((req, res) => {
    const user = requireRole(req, "tradie");
    const review = market.respondToReview({
      review_id: param(req, "id"),
      tradie_id: user.id,
      response: String(req.body?.response ?? ""),
    });
    res.status(201).json(review);
  }));

  // GET /me/quotes — the tradie's own submitted quotes (with job + thread).
  api.get("/me/quotes", wrap((req, res) => {
    const user = requireRole(req, "tradie");
    const quotes = [...store.quotes.values()]
      .filter((q) => q.tradie_id === user.id)
      .map((q) => {
        const job = store.jobs.get(q.job_id);
        return {
          ...quoteView(q, store),
          thread_id: q.id,
          job: job ? leadView(store, job, user.id) : null,
        };
      });
    res.json(quotes);
  }));

  // GET /me/leads/won — bookings won by this tradie.
  api.get("/me/leads/won", wrap((req, res) => {
    const user = requireRole(req, "tradie");
    const won = [...store.bookings.values()]
      .filter((bk) => bk.tradie_id === user.id)
      .map((bk) => {
        const job = store.jobs.get(bk.job_id);
        return {
          booking: bk,
          thread_id: bk.quote_id,
          job: job ? leadView(store, job, user.id) : null,
          payment: market.paymentForBooking(bk.id) ?? null,
          variations: market.variationsForBooking(bk.id),
          reviews: market.reviewsForBooking(bk.id),
        };
      });
    res.json(won);
  }));

  // ---- Shared: messaging, bookings, reviews ----
  // POST /threads/:id/messages — masked in-app chat (§9).
  api.post("/threads/:id/messages", wrap((req, res) => {
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

  api.get("/threads/:id/messages", wrap((req, res) => {
    requireRole(req, "homeowner", "tradie");
    if (!store.threads.get(param(req, "id"))) throw new HttpError(404, "Thread not found");
    res.json(store.messagesForThread(param(req, "id")));
  }));

  // POST /bookings/:id/complete
  api.post("/bookings/:id/complete", wrap((req, res) => {
    requireRole(req, "homeowner", "tradie", "admin");
    const booking = store.bookings.get(param(req, "id"));
    if (!booking) throw new HttpError(404, "Booking not found");
    res.json(market.completeBooking(booking.id));
  }));

  // POST /bookings/:id/review — structured two-way rating (§4), verified-paid.
  api.post("/bookings/:id/review", wrap((req, res) => {
    const user = requireRole(req, "homeowner", "tradie");
    const b = req.body ?? {};
    const review = market.submitReview({
      booking_id: param(req, "id"),
      rater_role: user.role === "tradie" ? "tradie" : "homeowner",
      rater_id: user.id,
      overall: Number(b.overall ?? b.rating),
      dimensions: b.dimensions && typeof b.dimensions === "object" ? b.dimensions : {},
      text: String(b.text ?? ""),
    });
    res.status(201).json(review);
  }));

  // ---- variations (§4): trade proposes extra work, customer approves ----
  api.post("/bookings/:id/variations", wrap((req, res) => {
    const user = requireRole(req, "tradie");
    const b = req.body ?? {};
    if (typeof b.amount !== "number") throw new HttpError(400, "amount (AUD cents) required");
    const variation = market.proposeVariation({
      booking_id: param(req, "id"),
      tradie_id: user.id,
      amount: b.amount,
      reason: String(b.reason ?? ""),
    });
    res.status(201).json(variation);
  }));

  api.post("/variations/:id/approve", wrap((req, res) => {
    requireRole(req, "homeowner");
    res.json(market.approveVariation(param(req, "id")));
  }));

  api.post("/variations/:id/decline", wrap((req, res) => {
    requireRole(req, "homeowner");
    res.json(market.declineVariation(param(req, "id")));
  }));

  // POST /triage — internal: run triage without persisting a job (§8 shared).
  api.post("/triage", wrap(async (req, res) => {
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
  api.get("/admin/override-log", wrap((req, res) => {
    requireRole(req, "admin");
    res.json(store.overrideLog);
  }));

  api.get("/admin/leakage-log", wrap((req, res) => {
    requireRole(req, "admin");
    res.json(store.leakageLog);
  }));

  api.get("/admin/verification-queue", wrap((req, res) => {
    requireRole(req, "admin");
    const pending = store.allTradies().filter(
      (t) => t.verified_status === "pending" || t.verified_status === "unverified",
    );
    res.json(pending);
  }));

  app.use("/api", api);

  // Unknown API routes → JSON 404 (don't fall through to the SPA).
  app.use("/api", (_req, res) => res.status(404).json({ error: "Not found" }));

  // ---- static frontend (production) ----
  if (deps.staticDir) {
    app.use(express.static(deps.staticDir));
    app.get("*", (_req, res) => res.sendFile("index.html", { root: deps.staticDir! }));
  }

  // ---- error handler ----
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError || err instanceof AuthError) {
      res.status(err.status).json({ error: err.message });
    } else {
      const message = err instanceof Error ? err.message : "Internal error";
      res.status(400).json({ error: message });
    }
  });

  return app;
}
