/**
 * Orchestrates the core loop (§6, §7, §9) on top of the store, triage service
 * and matching. Routes stay thin; this is where the state transitions and
 * safety-relevant side effects live, so it can be unit-tested directly.
 */
import { v4 as uuidv4 } from "uuid";
import { MemoryStore } from "../store/memoryStore.js";
import { TriageService } from "../triage/triageService.js";
import {
  matchTradies,
  type MatchedTradie,
} from "../domain/matching.js";
import { maskContactInfo } from "../domain/contactMasking.js";
import {
  assertJobTransition,
  assertQuoteTransition,
} from "../domain/stateMachines.js";
import type {
  AustralianState,
  Booking,
  Job,
  Message,
  MessageSenderRole,
  Quote,
  Review,
  Triage,
} from "../domain/entities.js";
import type { Category } from "../triage/schema.js";

export interface CreateJobInput {
  homeowner_id: string;
  description: string;
  photos: string[];
  suburb: string;
  postcode: string;
  state: AustralianState;
  full_address?: string;
  category?: Category;
}

export interface CreateJobResult {
  job: Job;
  triage: Triage;
  matched: MatchedTradie[];
}

export class MarketplaceService {
  constructor(
    private readonly store: MemoryStore,
    private readonly triageSvc: TriageService,
    private readonly clock: () => string = () => new Date().toISOString(),
  ) {}

  async createJob(input: CreateJobInput): Promise<CreateJobResult> {
    const now = this.clock();
    const outcome = await this.triageSvc.triage({
      description: input.description,
      photoCount: input.photos.length,
      suburb: input.suburb,
      category_hint: input.category,
    });
    const result = outcome.gate.triage;

    const job: Job = {
      id: uuidv4(),
      homeowner_id: input.homeowner_id,
      category: input.category ?? result.category,
      description: input.description,
      photos: input.photos,
      suburb: input.suburb,
      postcode: input.postcode,
      state: input.state,
      full_address: input.full_address,
      urgency: result.job_spec?.urgency ?? "routine",
      status: "DRAFT",
      created_at: now,
    };
    this.store.jobs.set(job.id, job);

    const triage: Triage = {
      id: result.triage_id,
      job_id: job.id,
      result,
      model_verdict: outcome.gate.model_verdict,
      final_verdict: result.verdict,
      overrides: outcome.gate.overrides,
      created_at: now,
    };
    this.store.triages.set(triage.id, triage);
    this.store.triageByJob.set(job.id, triage.id);

    // §1.7 audit every override.
    if (triage.overrides.length > 0) {
      this.store.overrideLog.push({
        triage_id: triage.id,
        job_id: job.id,
        at: now,
        overrides: triage.overrides,
      });
    }

    // TRIAGED, then branch: DIY_SAFE is terminal; everything else posts for quotes.
    this.transitionJob(job, "TRIAGED");
    let matched: MatchedTradie[] = [];
    if (result.verdict === "DIY_SAFE") {
      this.transitionJob(job, "DIY_RESOLVED");
    } else {
      this.transitionJob(job, "POSTED");
      matched = matchTradies(job, result, this.store.allTradies(), {
        now,
        cap: 4,
      });
      // Notification is a stub (§7 push + SMS/email would go here).
      if (matched.length > 0) this.transitionJob(job, "QUOTING");
    }

    return { job, triage, matched };
  }

  submitQuote(args: {
    job_id: string;
    tradie_id: string;
    amount: number;
    inclusions: string;
    earliest_availability?: string;
  }): Quote {
    const job = this.mustJob(args.job_id);
    if (job.status !== "POSTED" && job.status !== "QUOTING") {
      throw new Error(`Job ${job.id} is not accepting quotes (status ${job.status})`);
    }
    const quote: Quote = {
      id: uuidv4(),
      job_id: args.job_id,
      tradie_id: args.tradie_id,
      amount: args.amount,
      inclusions: args.inclusions,
      earliest_availability: args.earliest_availability,
      status: "submitted",
      created_at: this.clock(),
    };
    this.store.quotes.set(quote.id, quote);
    if (job.status === "POSTED") this.transitionJob(job, "QUOTING");

    // Sealed quote → open a masked thread for this quote (§9).
    this.store.threads.set(quote.id, {
      id: quote.id,
      quote_id: quote.id,
      job_id: job.id,
    });
    return quote;
  }

  /**
   * Accept a quote (§6): auto-decline the rest, reveal the address to the
   * winner only, and create the booking.
   */
  acceptQuote(quoteId: string): { quote: Quote; booking: Booking } {
    const quote = this.mustQuote(quoteId);
    const job = this.mustJob(quote.job_id);

    assertQuoteTransition(quote.status, "accepted");
    quote.status = "accepted";

    for (const other of this.store.quotesForJob(job.id)) {
      if (other.id !== quote.id && other.status === "submitted") {
        other.status = "declined";
      }
    }

    this.transitionJob(job, "QUOTE_ACCEPTED");

    const booking: Booking = {
      id: uuidv4(),
      job_id: job.id,
      quote_id: quote.id,
      tradie_id: quote.tradie_id,
      status: "scheduled",
      scheduled_for: quote.earliest_availability,
    };
    this.store.bookings.set(booking.id, booking);
    this.transitionJob(job, "BOOKED");
    // Address is now revealed to the winning tradie only — enforced at the read
    // layer (leadView) by checking booking ownership.
    return { quote, booking };
  }

  postMessage(args: {
    thread_id: string;
    sender_role: MessageSenderRole;
    body: string;
  }): Message {
    const thread = this.store.threads.get(args.thread_id);
    if (!thread) throw new Error(`Thread ${args.thread_id} not found`);
    const { body, redacted } = maskContactInfo(args.body);
    const message: Message = {
      id: uuidv4(),
      thread_id: args.thread_id,
      sender_role: args.sender_role,
      body,
      redacted,
      created_at: this.clock(),
    };
    this.store.messages.set(message.id, message);
    if (redacted) {
      this.store.leakageLog.push({
        thread_id: args.thread_id,
        sender_role: args.sender_role,
        at: message.created_at,
      });
    }
    return message;
  }

  completeBooking(bookingId: string): Booking {
    const booking = this.mustBooking(bookingId);
    booking.status = "completed";
    const job = this.mustJob(booking.job_id);
    this.transitionJob(job, "COMPLETED");
    return booking;
  }

  reviewBooking(args: { booking_id: string; rating: number; text: string }): Review {
    const booking = this.mustBooking(args.booking_id);
    if (booking.status !== "completed") {
      throw new Error("Reviews can only be left after a completed booking");
    }
    if (args.rating < 1 || args.rating > 5) {
      throw new Error("Rating must be 1..5");
    }
    const review: Review = {
      id: uuidv4(),
      booking_id: args.booking_id,
      rating: args.rating,
      text: args.text,
      created_at: this.clock(),
    };
    this.store.reviews.set(review.id, review);
    const job = this.mustJob(booking.job_id);
    this.transitionJob(job, "REVIEWED");

    // Fold the rating into the tradie's running average (§5).
    const tradie = this.store.tradies.get(booking.tradie_id);
    if (tradie) {
      const total = tradie.rating_avg * tradie.jobs_completed + args.rating;
      tradie.jobs_completed += 1;
      tradie.rating_avg = total / tradie.jobs_completed;
    }
    return review;
  }

  private transitionJob(job: Job, to: Job["status"]): void {
    assertJobTransition(job.status, to);
    job.status = to;
  }

  private mustJob(id: string): Job {
    const j = this.store.jobs.get(id);
    if (!j) throw new Error(`Job ${id} not found`);
    return j;
  }
  private mustQuote(id: string): Quote {
    const q = this.store.quotes.get(id);
    if (!q) throw new Error(`Quote ${id} not found`);
    return q;
  }
  private mustBooking(id: string): Booking {
    const b = this.store.bookings.get(id);
    if (!b) throw new Error(`Booking ${id} not found`);
    return b;
  }
}
