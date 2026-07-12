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
import { computeFee } from "../payments/fees.js";
import { MockPaymentProvider, type PaymentProvider } from "../payments/provider.js";
import {
  MockQuoteAssistantClient,
  estimateBallpark,
  type QuoteAssistantClient,
  type QuoteDraft,
  type VariationDraft,
  type QuoteExplanation,
  type ReplySuggestion,
  type ReviewResponseDraft,
} from "../quoting/quoteAssistant.js";
import type { TriageImage } from "../triage/llmClient.js";
import type { VisionSummary } from "../triage/triageService.js";
import type {
  AustralianState,
  Booking,
  Job,
  Message,
  MessageSenderRole,
  Payment,
  Quote,
  QuoteKind,
  Review,
  TradieProfile,
  Triage,
  Variation,
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
  /** Actual image bytes for vision-capable triage. */
  images?: TriageImage[];
  /** Homeowner's per-photo note. */
  captions?: string[];
}

export interface CreateJobResult {
  job: Job;
  triage: Triage;
  /** The single vetted trade the job was assigned to (§3), or null if none. */
  assigned: TradieProfile | null;
  /** The instant firm quote when it's a price-book job; null for custom/DIY. */
  quote: Quote | null;
  /** Transparent photo-analysis record (never affects the safety verdict). */
  vision: VisionSummary;
  /** Pre-visit price range for a custom job awaiting its firm quote; else null. */
  ballpark: { low: number; high: number } | null;
}

export class MarketplaceService {
  private readonly payments: PaymentProvider;
  private readonly quoteAssistant: QuoteAssistantClient;

  constructor(
    private readonly store: MemoryStore,
    private readonly triageSvc: TriageService,
    private readonly clock: () => string = () => new Date().toISOString(),
    payments?: PaymentProvider,
    quoteAssistant?: QuoteAssistantClient,
  ) {
    this.payments = payments ?? new MockPaymentProvider();
    this.quoteAssistant = quoteAssistant ?? new MockQuoteAssistantClient();
  }

  async createJob(input: CreateJobInput): Promise<CreateJobResult> {
    const now = this.clock();
    const outcome = await this.triageSvc.triage({
      description: input.description,
      photoCount: input.photos.length,
      suburb: input.suburb,
      category_hint: input.category,
      images: input.images,
      captions: input.captions,
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
      vision: outcome.vision,
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

    // A pre-visit range only makes sense while a custom quote is pending.
    const ballpark =
      job.status === "AWAITING_QUOTE"
        ? estimateBallpark(job.category, job.urgency, result.job_spec?.symptoms?.length ?? 0)
        : null;

    return { job, triage, assigned, quote, vision: outcome.vision, ballpark };
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
   * AI Quote Assistant: draft a firm quote for the assigned trade on a custom
   * job. Seeded with the platform's own triage job-spec and any price-book
   * anchor — context a blank chat box can't provide. The draft is an aid; the
   * trade edits it and submits through submitFirmQuote. Nothing is persisted.
   */
  async draftQuote(args: { job_id: string; tradie_id: string }): Promise<QuoteDraft> {
    const job = this.mustJob(args.job_id);
    if (job.assigned_tradie_id !== args.tradie_id) {
      throw new Error("This job isn't assigned to you");
    }
    if (job.status !== "AWAITING_QUOTE") {
      throw new Error(`Job ${job.id} isn't awaiting a quote (status ${job.status})`);
    }
    const triageId = this.store.triageByJob.get(job.id);
    const triage = triageId ? this.store.triages.get(triageId) : undefined;
    const spec = triage?.result.job_spec ?? null;
    // A custom job normally has no price-book match, but check anyway so the
    // assistant leads with the platform's own number whenever one exists.
    const anchor = priceBookLookup(job.category, `${job.description} ${spec?.title ?? ""}`);

    const draft = await this.quoteAssistant.draft({
      category: job.category,
      suburb: job.suburb,
      urgency: job.urgency,
      required_licence_class: triage?.result.required_licence_class ?? null,
      job_spec: spec
        ? {
            title: spec.title,
            summary: spec.summary,
            symptoms: spec.symptoms,
            questions_for_site_visit: spec.questions_for_site_visit,
          }
        : null,
      description: job.description,
      price_book_anchor: anchor ? { label: anchor.label, amount: anchor.amount } : null,
    });

    // Defence in depth (§9): the customer-facing text goes through the same
    // contact-masking filter as in-app messages, so a draft can never leak a
    // way to take the job off-platform.
    return {
      ...draft,
      customer_message: maskContactInfo(draft.customer_message).body,
      scope_of_work: maskContactInfo(draft.scope_of_work).body,
    };
  }

  /** #1 AI-draft a variation (extra work) for the trade to send for approval. */
  async draftVariation(args: { booking_id: string; tradie_id: string; found_note: string }): Promise<VariationDraft> {
    const booking = this.mustBooking(args.booking_id);
    if (booking.tradie_id !== args.tradie_id) throw new Error("This booking isn't yours");
    if (booking.status !== "scheduled") throw new Error("Variations can only be raised on a scheduled job");
    const job = this.mustJob(booking.job_id);
    const draft = await this.quoteAssistant.draftVariation({
      category: job.category,
      urgency: job.urgency,
      found_note: args.found_note,
    });
    return {
      ...draft,
      reason: maskContactInfo(draft.reason).body,
      customer_message: maskContactInfo(draft.customer_message).body,
    };
  }

  /** #2 Explain a firm quote to the homeowner in plain language. */
  async explainQuote(args: { quote_id: string; homeowner_id: string }): Promise<QuoteExplanation> {
    const quote = this.mustQuote(args.quote_id);
    const job = this.mustJob(quote.job_id);
    if (job.homeowner_id !== args.homeowner_id) throw new Error("Not your job");
    const triageId = this.store.triageByJob.get(job.id);
    const triage = triageId ? this.store.triages.get(triageId) : undefined;
    return this.quoteAssistant.explainQuote({
      amount: quote.amount,
      inclusions: quote.inclusions,
      kind: quote.kind,
      category: job.category,
      job_title: triage?.result.job_spec?.title ?? `${job.category} job`,
    });
  }

  /** #3 Suggest a professional, on-platform reply in a message thread. */
  async suggestReply(args: { thread_id: string; role: "homeowner" | "tradie" }): Promise<ReplySuggestion> {
    const thread = this.store.threads.get(args.thread_id);
    if (!thread) throw new Error("Thread not found");
    const job = this.store.jobs.get(thread.job_id);
    const triageId = job ? this.store.triageByJob.get(job.id) : undefined;
    const triage = triageId ? this.store.triages.get(triageId) : undefined;
    const recent = this.store
      .messagesForThread(args.thread_id)
      .slice(-6)
      .map((m) => ({ role: m.sender_role, body: m.body }));
    const out = await this.quoteAssistant.suggestReply({
      role: args.role,
      job_title: triage?.result.job_spec?.title ?? "your job",
      recent,
    });
    // Never suggest a way off-platform.
    return { ...out, suggestion: maskContactInfo(out.suggestion).body };
  }

  /** #4 Draft the trade's public response to a homeowner's review. */
  async draftReviewResponse(args: { review_id: string; tradie_id: string }): Promise<ReviewResponseDraft> {
    const review = this.mustReview(args.review_id);
    if (review.rater_role !== "homeowner" || review.ratee_id !== args.tradie_id) {
      throw new Error("You can only respond to reviews written about you");
    }
    const tradie = this.store.tradies.get(args.tradie_id);
    const out = await this.quoteAssistant.draftReviewResponse({
      business_name: tradie?.business_name ?? "our team",
      overall: review.overall,
      text: review.text,
    });
    return { ...out, response: maskContactInfo(out.response).body };
  }

  /** #4 Persist the trade's public response to a review (masked, one per review). */
  respondToReview(args: { review_id: string; tradie_id: string; response: string }): Review {
    const review = this.mustReview(args.review_id);
    if (review.rater_role !== "homeowner" || review.ratee_id !== args.tradie_id) {
      throw new Error("You can only respond to reviews written about you");
    }
    if (review.response) throw new Error("You've already responded to this review");
    review.response = maskContactInfo(args.response).body;
    review.responded_at = this.clock();
    this.store.reviews.set(review.id, review);
    return review;
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

    // §3 authorise (hold) the full price now — nothing is captured until the
    // work is done. Fee/payout are provisional until capture.
    const auth = this.payments.authorize({
      amount: quote.amount,
      currency: "aud",
      job_id: job.id,
      tradie_id: quote.tradie_id,
    });
    const fee = computeFee(quote.amount);
    const payment: Payment = {
      id: uuidv4(),
      job_id: job.id,
      booking_id: booking.id,
      quote_id: quote.id,
      tradie_id: quote.tradie_id,
      currency: "aud",
      amount_authorized: quote.amount,
      platform_fee: fee.platform_fee,
      trade_payout: fee.trade_payout,
      status: "authorized",
      provider: this.payments.name,
      provider_ref: auth.ref,
      created_at: this.clock(),
    };
    this.store.payments.set(payment.id, payment);
    return { quote, booking };
  }

  // ---- payments & variations (§3, §4) ----

  paymentForBooking(bookingId: string): Payment | undefined {
    return [...this.store.payments.values()].find((p) => p.booking_id === bookingId);
  }

  variationsForBooking(bookingId: string): Variation[] {
    return [...this.store.variations.values()]
      .filter((v) => v.booking_id === bookingId)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
  }

  private approvedVariationTotal(bookingId: string): number {
    return this.variationsForBooking(bookingId)
      .filter((v) => v.status === "approved")
      .reduce((sum, v) => sum + v.amount, 0);
  }

  /** The assigned trade proposes extra work; the customer must approve it (§4). */
  proposeVariation(args: { booking_id: string; tradie_id: string; amount: number; reason: string }): Variation {
    const booking = this.mustBooking(args.booking_id);
    if (booking.tradie_id !== args.tradie_id) throw new Error("This booking isn't yours");
    if (booking.status !== "scheduled") throw new Error("Variations can only be raised on a scheduled job");
    if (!Number.isInteger(args.amount) || args.amount <= 0) throw new Error("Variation amount must be a positive integer (cents)");
    const variation: Variation = {
      id: uuidv4(),
      job_id: booking.job_id,
      booking_id: booking.id,
      tradie_id: args.tradie_id,
      amount: args.amount,
      reason: args.reason,
      status: "proposed",
      created_at: this.clock(),
    };
    this.store.variations.set(variation.id, variation);
    return variation;
  }

  approveVariation(variationId: string): Variation {
    return this.setVariationStatus(variationId, "approved");
  }
  declineVariation(variationId: string): Variation {
    return this.setVariationStatus(variationId, "declined");
  }
  private setVariationStatus(variationId: string, status: "approved" | "declined"): Variation {
    const v = this.store.variations.get(variationId);
    if (!v) throw new Error(`Variation ${variationId} not found`);
    if (v.status !== "proposed") throw new Error("This variation has already been decided");
    v.status = status;
    this.store.variations.set(v.id, v);
    return v;
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

    // §3 capture on completion: base price + approved variations; 5% fee taken
    // server-side, remainder to the trade.
    const payment = this.paymentForBooking(bookingId);
    if (payment && payment.status === "authorized") {
      const finalAmount = payment.amount_authorized + this.approvedVariationTotal(bookingId);
      const fee = computeFee(finalAmount);
      this.payments.capture(payment.provider_ref, finalAmount, fee.platform_fee);
      payment.status = "captured";
      payment.amount_captured = finalAmount;
      payment.platform_fee = fee.platform_fee;
      payment.trade_payout = fee.trade_payout;
      payment.captured_at = this.clock();
      this.store.payments.set(payment.id, payment);
    }
    return booking;
  }

  reviewsForBooking(bookingId: string): Review[] {
    return [...this.store.reviews.values()].filter((r) => r.booking_id === bookingId);
  }
  reviewsAboutTradie(tradieId: string): Review[] {
    return [...this.store.reviews.values()].filter((r) => r.ratee_id === tradieId && r.rater_role === "homeowner");
  }

  /**
   * §4 Submit a structured review. Verified-paid only (booking completed), one
   * per rater per booking. The customer's review closes the job (→ REVIEWED);
   * both directions feed running averages.
   */
  submitReview(args: {
    booking_id: string;
    rater_role: "homeowner" | "tradie";
    rater_id: string;
    overall: number;
    dimensions: Record<string, number>;
    text: string;
  }): Review {
    const booking = this.mustBooking(args.booking_id);
    if (booking.status !== "completed") {
      throw new Error("You can only rate after the job is completed and paid");
    }
    if (this.reviewsForBooking(booking.id).some((r) => r.rater_role === args.rater_role)) {
      throw new Error("You've already rated this job");
    }
    const scores = [args.overall, ...Object.values(args.dimensions)];
    if (scores.some((s) => !Number.isFinite(s) || s < 1 || s > 5)) {
      throw new Error("Ratings must be between 1 and 5");
    }
    const job = this.mustJob(booking.job_id);
    const ratee_id = args.rater_role === "homeowner" ? booking.tradie_id : job.homeowner_id;

    const review: Review = {
      id: uuidv4(),
      booking_id: booking.id,
      job_id: job.id,
      rater_role: args.rater_role,
      rater_id: args.rater_id,
      ratee_id,
      overall: args.overall,
      dimensions: args.dimensions,
      text: args.text,
      created_at: this.clock(),
    };
    this.store.reviews.set(review.id, review);

    if (args.rater_role === "homeowner") {
      // Customer rated the trade → fold into the trade's average, close the job.
      const tradie = this.store.tradies.get(ratee_id);
      if (tradie) {
        const total = tradie.rating_avg * tradie.jobs_completed + args.overall;
        tradie.jobs_completed += 1;
        tradie.rating_avg = total / tradie.jobs_completed;
        this.store.tradies.set(tradie.user_id, tradie);
      }
      if (job.status === "COMPLETED") this.transitionJob(job, "REVIEWED");
    } else {
      // Trade rated the customer → fold into the customer's average.
      const owner = this.store.homeowners.get(ratee_id);
      if (owner) {
        const n = owner.ratings_count ?? 0;
        owner.rating_avg = ((owner.rating_avg ?? 0) * n + args.overall) / (n + 1);
        owner.ratings_count = n + 1;
        this.store.homeowners.set(owner.user_id, owner);
      }
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
  private mustReview(id: string): Review {
    const r = this.store.reviews.get(id);
    if (!r) throw new Error(`Review ${id} not found`);
    return r;
  }
}
