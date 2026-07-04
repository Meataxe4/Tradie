/**
 * Read-model shaping. Enforces §9 anonymity at the boundary: tradies see the
 * suburb only until they win the job; the homeowner's name/address and other
 * tradies' quotes are never exposed.
 *
 * These views also carry the trust signals the UI leans on (ratings, response
 * time, verified/licence badges, member-since) — the Airtasker-style social
 * proof — computed here so the client never has to stitch entities together.
 */
import type { Job, Quote, Triage } from "../domain/entities.js";
import { MemoryStore } from "../store/memoryStore.js";

/** Public trust summary for a tradie (safe to show a homeowner). */
export function tradieSummary(store: MemoryStore, tradieId: string) {
  const t = store.tradies.get(tradieId);
  const user = store.users.get(tradieId);
  if (!t) return null;
  const licence = t.licences[0];
  return {
    tradie_id: t.user_id,
    business_name: t.business_name,
    rating_avg: t.rating_avg,
    jobs_completed: t.jobs_completed,
    response_minutes: t.avg_response_minutes ?? null,
    verified: t.verified_status === "verified",
    licence_class: licence?.class ?? null,
    licence_verified: licence?.verified_status === "verified",
    insured: Boolean(t.insurance.public_liability_expiry),
    member_since: user?.created_at ?? null,
  };
}

/** What a tradie sees for a lead — homeowner masked, address hidden pre-booking. */
export function leadView(store: MemoryStore, job: Job, tradieId: string) {
  const triageId = store.triageByJob.get(job.id);
  const triage = triageId ? store.triages.get(triageId) : undefined;
  const booking = [...store.bookings.values()].find(
    (b) => b.job_id === job.id && b.tradie_id === tradieId,
  );
  const won = Boolean(booking);
  const homeowner = store.users.get(job.homeowner_id);
  const quoteCount = store.quotesForJob(job.id).filter((q) => q.status !== "declined").length;
  return {
    job_id: job.id,
    category: job.category,
    suburb: job.suburb,
    // Never expose full postcode-precise address or homeowner identity pre-win.
    full_address: won ? job.full_address ?? null : null,
    urgency: job.urgency,
    status: job.status,
    // The job_spec is the tradie-facing artefact (§2); never DIY guidance.
    job_spec: triage?.result.job_spec ?? null,
    why_pro_needed: triage?.result.why_pro_needed ?? null,
    required_licence_class: triage?.result.required_licence_class ?? null,
    photos: job.photos,
    created_at: job.created_at,
    quote_count: quoteCount,
    // §9 poster trust cue WITHOUT identity: suburb + account age only.
    poster: {
      suburb: job.suburb,
      member_since: homeowner?.created_at ?? null,
      verified: homeowner?.status === "active",
    },
  };
}

/** The homeowner's private view of one quote — full detail, rich tradie trust. */
export function quoteView(quote: Quote, store: MemoryStore) {
  return {
    quote_id: quote.id,
    job_id: quote.job_id,
    tradie: tradieSummary(store, quote.tradie_id),
    amount: quote.amount,
    inclusions: quote.inclusions,
    earliest_availability: quote.earliest_availability,
    status: quote.status,
    created_at: quote.created_at,
  };
}

/** The homeowner's view of their own job, including the full triage result. */
export function homeownerJobView(job: Job, triage: Triage | undefined) {
  return {
    ...job,
    triage: triage?.result ?? null,
  };
}
