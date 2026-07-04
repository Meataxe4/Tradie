/**
 * Read-model shaping. Enforces §9 anonymity at the boundary: tradies see the
 * suburb only until they win the job; the homeowner's name/address and other
 * tradies' quotes are never exposed.
 */
import type { Job, Quote, Triage } from "../domain/entities.js";
import { MemoryStore } from "../store/memoryStore.js";

/** What a tradie sees for a lead — homeowner masked, address hidden pre-booking. */
export function leadView(store: MemoryStore, job: Job, tradieId: string) {
  const triageId = store.triageByJob.get(job.id);
  const triage = triageId ? store.triages.get(triageId) : undefined;
  const booking = [...store.bookings.values()].find(
    (b) => b.job_id === job.id && b.tradie_id === tradieId,
  );
  const won = Boolean(booking);
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
  };
}

/** The homeowner's private quote list — full detail, all quotes on their job. */
export function quoteView(quote: Quote, store: MemoryStore) {
  const tradie = store.tradies.get(quote.tradie_id);
  return {
    quote_id: quote.id,
    job_id: quote.job_id,
    tradie: tradie
      ? {
          tradie_id: tradie.user_id,
          business_name: tradie.business_name,
          rating_avg: tradie.rating_avg,
          jobs_completed: tradie.jobs_completed,
        }
      : null,
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
