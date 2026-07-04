/**
 * §7 Matching logic. A job is offered to a tradie only if ALL hold:
 *   - category is in the tradie's trades[]
 *   - the job postcode is in service_postcodes[] (radius is a v1 refinement)
 *   - the tradie holds the required licence class for the job, in the job's
 *     state, verified and not expired (a restricted licence never matches an
 *     unrestricted requirement)
 * Results are ranked by rating_avg × response-speed and capped per job.
 */
import type { Job, TradieProfile, Licence } from "./entities.js";
import type { TriageResult } from "../triage/schema.js";

export interface MatchOptions {
  /** ISO date used to test licence expiry. */
  now: string;
  /** Cap notified tradies per job to keep quote quality high (§7). */
  cap?: number;
}

export interface MatchedTradie {
  tradie: TradieProfile;
  score: number;
}

/** Is a licence valid for this job: right class, right state, verified, unexpired. */
export function licenceMatches(
  licence: Licence,
  requiredClass: string | null,
  jobState: string,
  now: string,
): boolean {
  if (licence.state !== jobState) return false;
  if (licence.verified_status !== "verified") return false;
  if (licence.expiry && licence.expiry < now) return false;
  // No licence class required (e.g. handyman) → any verified licence, or none, passes.
  if (!requiredClass) return true;
  return classSatisfies(licence.class, requiredClass);
}

/**
 * A restricted licence never satisfies an unrestricted requirement. We treat
 * the required class as satisfied when the held class string contains the
 * required class' significant tokens and is not explicitly "restricted" when
 * the requirement is "unrestricted".
 */
export function classSatisfies(held: string, required: string): boolean {
  const h = held.toLowerCase();
  const r = required.toLowerCase();
  if (r.includes("unrestricted") && h.includes("restricted") && !h.includes("unrestricted")) {
    return false;
  }
  // Match on the trade keyword (electrical/plumbing/gas/etc.).
  const keyword = r.split(/\s+/).find((w) => w.length > 3 && w !== "licence" && w !== "unrestricted" && w !== "contractor");
  if (keyword && !h.includes(keyword)) return false;
  return true;
}

export function tradieCanServe(
  tradie: TradieProfile,
  job: Job,
  triage: TriageResult,
  opts: MatchOptions,
): boolean {
  if (tradie.verified_status !== "verified") return false;
  if (!tradie.trades.includes(job.category)) return false;
  if (!tradie.service_postcodes.includes(job.postcode)) return false;

  const required = triage.required_licence_class;
  // If the job needs no licence class at all, licence check is skipped.
  if (required === null) return true;

  return tradie.licences.some((l) =>
    licenceMatches(l, required, job.state, opts.now),
  );
}

/** rating_avg × response-speed (§7). Faster response → higher factor. */
export function rankScore(tradie: TradieProfile): number {
  const rating = tradie.rating_avg || 0;
  const mins = tradie.avg_response_minutes ?? 120;
  const speedFactor = 1 / (1 + mins / 60); // 1.0 instant → ~0.33 at 2h
  return rating * speedFactor;
}

export function matchTradies(
  job: Job,
  triage: TriageResult,
  tradies: TradieProfile[],
  opts: MatchOptions,
): MatchedTradie[] {
  const cap = opts.cap ?? 4;
  return tradies
    .filter((t) => tradieCanServe(t, job, triage, opts))
    .map((t) => ({ tradie: t, score: rankScore(t) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, cap);
}
