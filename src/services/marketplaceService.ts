/**
 * Orchestrates the core loop (§6, §7, §9) on top of the store, triage service
 * and matching. Routes stay thin; this is where the state transitions and
 * safety-relevant side effects live, so it can be unit-tested directly.
 */
import { v4 as uuidv4 } from "uuid";
import { MemoryStore } from "../store/memoryStore.js";
import { TriageService } from "../triage/triageService.js";
import { assignBestTradie } from "../domain/matching.js";
import { priceBookLookup } from "../domain/priceBook.js";
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
  QuoteKind,
  Review,
  TradieProfile,
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
  /** The single vetted trade the job was assigned to (§3), or null if none. */
  assigned: TradieProfile | null;
  /** The instant firm quote when it's a price-book job; null for custom/DIY. */
  quote: Quote | null;
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

    this.transitionJob(job, "TRIAGED");
    let assigned: TradieProfile | null = null;
    let quote: Quote | null = null;

    if (result.verdict === "DIY_SAFE") {
      this.transitionJob(job, "DIY_RESOLVED");
    } else {
      // §3 assign ONE vetted trade (assigned, not auctioned).
      assigned = assignBestTradie(job, result, this.store.allTradies(), { now });
      if (assigned) job.assigned_tradie_id = assigned.user_id;

      // Price-book match → instant firm quote; otherwise route as a custom quote.
      const pb = assigned
        ? priceBookLookup(job.category, `${input.description} ${result.job_spec?.title ?? ""}`)
        : null;
      if (assigned && pb) {
        job.quote_kind = "price_book";
        job.price_book_key = pb.key;
        quote = this.createFirmQuote(job, assigned.user_id, "price_book", pb.amount, pb.label, now);
        this.transitionJob(job, "QUOTED");
      } else {
        job.quote_kind = "custom";
        this.transitionJob(job, "AWAITING_QUOTE");
      }
    }

    return { job, triage, assigned, quote };
  }

  /** Create the single firm quote for a job (price-book or custom) + its thread. */
  private createFirmQuote(
    job: Job,
    tradieId: string,
    kind: QuoteKind,
    amount: number,
    inclusions: string,
    now: string,
    availability?: string,
  ): Quote {
    const quote: Quote = {
      id: uuidv4(),
      job_id: job.id,
      tradie_id: tradieId,
      kind,
      amount,
      inclusions,
      earliest_availability: availability,
      status: "offered",
      created_at: now,
    };
    this.store.quotes.set(quote.id, quote);
    this.store.threads.set(quote.id, { id: quote.id, quote_id: quote.id, job_id: job.id });
    return quote;
  }

  /** The assigned trade returns a firm quote for their custom (routed) job. */
  submitFirmQuote(args: {
    job_id: string;
    tradie_id: string;
    amount: number;
    inclusions: string;
    earliest_availability?: string;
  }): Quote {
    const job = this.mustJob(args.job_id);
    if (job.assigned_tradie_id !== args.tradie_id) {
      throw new Error("This job isn't assigned to you");
    }
    if (job.status !== "AWAITING_QUOTE") {
      throw new Error(`Job ${job.id} isn't awaiting a quote (status ${job.status})`);
    }
    const quote = this.createFirmQuote(
      job,
      args.tradie_id,
      "custom",
      args.amount,
      args.inclusions,
      this.clock(),
      args.earliest_availability,
    );
    this.transitionJob(job, "QUOTED");
    return quote;
  }

  /** Legacy alias retained for older call sites; forwards to submitFirmQuote. */
  submitQuote(args: {
    job_id: string;
    tradie_id: string;
    amount: number;
    inclusions: string;
    earliest_availability?: string;
  }): Quote {
    return this.submitFirmQuote(args);
  }

  /**
   * Accept the firm quote (§3 "one quote, one tap"): book the job and reveal the
   * address to the assigned trade only. Payment authorisation is layered on top
   * of this by the payments service.
   */
  acceptQuote(quoteId: string): { quote: Quote; booking: Booking } {
    const quote = this.mustQuote(quoteId);
    const job = this.mustJob(quote.job_id);

    assertQuoteTransition(quote.status, "accepted");
    quote.status = "accepted";
    this.store.quotes.set(quote.id, quote);

    this.transitionJob(job, "BOOKED");

    const booking: Booking = {
      id: uuidv4(),
      job_id: job.id,
      quote_id: quote.id,
      tradie_id: quote.tradie_id,
      status: "scheduled",
      scheduled_for: quote.earliest_availability,
    };
    this.store.bookings.set(booking.id, booking);
    return { quote, booking };
  }

  /** Customer declines the firm quote — the job is closed. */
  declineQuote(quoteId: string): Quote {
    const quote = this.mustQuote(quoteId);
    const job = this.mustJob(quote.job_id);
    assertQuoteTransition(quote.status, "declined");
    quote.status = "declined";
    this.store.quotes.set(quote.id, quote);
    this.transitionJob(job, "DECLINED");
    return quote;
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
    this.store.bookings.set(booking.id, booking);
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
      this.store.tradies.set(tradie.user_id, tradie);
    }
    return review;
  }

  private transitionJob(job: Job, to: Job["status"]): void {
    assertJobTransition(job.status, to);
    job.status = to;
    this.store.jobs.set(job.id, job); // persist (SqlMap needs the write-back)
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
