# Sorted By — Product Status Report

**Prepared for partner review · July 2026**

---

## 1. What Sorted By is

Sorted By is an Australian home-services marketplace built around one idea: **a great tradie at a fair price, sorted.** A homeowner describes a problem in plain English (with photos); an AI concierge triages it safely; the platform assigns **one** vetted, licensed local trade — no bidding wars, no pay-per-lead — who provides **one firm, GST-inclusive price** (instant from a price book for common jobs, or a routed custom quote). Payment is held at booking and released on completion, with a **5% success fee** on completed jobs only. Extra work needs customer approval before it counts. Both sides rate each other on structured dimensions, verified-paid only.

The strategic positioning against hipages (subscription/lead-fee model, ACCC trust stain) and Airtasker (2–4× our fee, minimal vetting) is: *tradies pay for jobs, not leads; homeowners get price certainty and payment protection; nobody else triages.*

**Launch wedge:** Sydney Inner West — plumbers, electricians, carpenters/handymen.

---

## 2. What is built and working today

Everything below is **working software**, covered by **106 automated tests**, with a click-through demo covering every user role. It is an MVP-quality build: the product logic is real; several infrastructure layers are deliberately simulated (Section 3 is explicit about which).

### 2.1 The safety-gated AI concierge (the core asset)

- Four triage verdicts: **DIY-safe / Needs licensed pro / Emergency stop / Unclear**, produced against a strict schema.
- A **server-side safety gate** validates every AI response before a user sees it. It can only ever *escalate* risk, never downgrade: any safety flag forces Emergency; regulated categories (electrical, gas, water plumbing) can never receive DIY steps; a banned-content scan catches jailbreak attempts; model errors **fail closed** to "needs a licensed pro." Every override is logged for audit.
- The DIY allowlist and licensing boundaries mirror actual NSW law (electrical: nothing beyond globes/safety-switch resets/plug-ins; plumbing and gas licensed at any value).
- **Emergency UX:** an emergency verdict takes over the whole screen — tap-to-call 000 and 1800 GAS LEAK, safety steps first, details only after "I'm safe."

### 2.2 The marketplace loop

- **Assigned, not auctioned:** matching filters to verified tradies with the right licence class (state-checked, expiry-checked; a restricted licence never satisfies an unrestricted requirement), right trade, right service area — ranked by rating and response speed. The job goes to one trade.
- **Price book** for common jobs (instant firm quotes: power points, downlights, taps, cisterns, etc.); everything else routes to the assigned trade for a custom firm quote, with a clearly-labelled indicative range shown to the customer while they wait.
- **Payments/escrow model:** full amount authorised (held) at booking; captured on completion; 5% platform fee computed server-side; the payout breakdown is shown to the trade line-by-line. **In-app variations:** the trade proposes extra work with a price; nothing counts until the customer approves; approved variations are added to the capture with the fee recomputed.
- **Structured two-way ratings**, verified-paid only: customers rate quality/timeliness/communication/tidiness/value; trades rate scope clarity/communication/access/prompt payment. Dimension strengths ("Always on time") surface on profiles. Ratings feed matching priority.
- **Privacy & anti-circumvention:** tradies see suburb only until they win the job; full name/address revealed only on booking. In-app chat masks phone numbers and emails automatically, and every redaction is logged.
- **Accounts & persistence:** real registration/login (hashed passwords, signed session tokens), SQLite persistence that survives restarts, one-click demo personas.

### 2.3 The AI Copilot suite (both sides of the market)

Every AI feature is fed by data only the platform holds — triage spec, price book, payment ledger, ratings — which is the defensible version of "AI features." All customer-facing AI text passes the same contact-masking filter as chat (an AI draft can never leak a way off-platform). Each runs on a deterministic offline engine today and switches to Anthropic's Claude the moment an API key is configured (see 3.1).

| Feature | Who | What it does |
|---|---|---|
| Photo-aware triage | Homeowner | Up to 3 photos with captions; on the live path the model inspects the images for hazards (escalate-only — a photo can never make a job look *safer*); transparent labelling of what was actually analysed |
| Pre-visit ballpark | Homeowner | Indicative price range while awaiting the firm quote |
| AI quote drafting | Trade | One tap drafts a firm quote: line items, scope, assumptions, customer message — seeded from the triage spec and price book |
| AI variation drafting | Trade | Describes what they found on site; gets a fair price + customer note |
| Quote explainer | Homeowner | Plain-English "what you're paying for" + questions to ask |
| Suggested replies | Both | One-tap professional replies in chat |
| Review responses | Trade | Drafts a public reply to a customer review |

### 2.4 UX layer (post-review overhaul, all 10 recommendations shipped)

- Human status language everywhere ("Finding your price", "Booked in" — internal state names never reach a customer).
- **Payment confirmation sheet** before booking: the price, what's included, "held — not charged", the CTA states the amount.
- Live **waiting timeline** while a quote is pending (assigned trade named, expected timing, typical range) — the anxious-silence gap is closed.
- **Quote SLA countdown** for trades ("Quote within 1h 40m to keep your fast-response rating") — makes the matching engine's speed lever visible and competitive.
- **Decline & reassign:** a customer who doesn't like the price keeps the job; it moves to the next vetted trade. Above-range quotes get a proactive explanation rather than silent sticker shock.
- Trade home restructured into **To quote / Booked / Money** (with a paid + held earnings strip); trade-shaped availability slots ("Tomorrow arvo", "9–12") instead of date pickers.
- Accessibility pass: 44px touch targets, 16px mobile type — the 55+ homeowner demographic is a first-class user.

### 2.5 Concept-stage extensions (from the product brief, all three built)

- **Multi-trade jobs:** triage detects a problem spanning trades (e.g. ceiling leak → plumber → carpenter → painter) and builds a sequenced project — one customer flow, one payment relationship, while each trade sees only a clean single-trade job. Safety verdicts always win: emergencies are never decomposed, and every stage runs the full triage + gate pipeline itself.
- **Customer projects & home logbook:** customers group jobs ("Fix the bathroom"), see indicative pricing before committing, and accumulate a record of completed, certified work — the beginning of the sale-time/insurance logbook.
- **Certification layer (NSW-grounded):** the platform knows which work legally requires a compliance certificate (electrical CCEW within 7 days; gas within 5 business days; plumbing CoC on completion; carpentry/painting → statutory warranties instead). Completed regulated jobs prompt the trade to attach the certificate reference; it's stored on the job record, shown to the customer, and flagged when missing.

### 2.6 Anti-leakage economics (the cash-job problem, closed)

The failure mode we designed against: work gets done, the homeowner pays cash, nobody marks the job complete, the platform's fee evaporates.

- **Confirm-or-auto-release:** the trade can only *request* completion; the customer gets 48 hours to confirm (instant release) or raise an issue (release paused, lands in ops); **silence auto-captures.** Inaction now favours the platform — a cash deal requires both parties to actively intervene, not passively drift.
- **Ops "needs attention" queue:** disputed bookings and stale ones (booked >7 days, no completion request — the leakage suspects) surface on the owner dashboard with the held amount and a one-click resolve.
- **Value stated at the moment of temptation**, both sides: what each party loses by going around (protection, certificate, record, rating) and that it breaches the terms.
- **Book-again:** completed jobs offer one-tap rebooking with the same trade (preferred matching) — repeat jobs, the highest-leakage moment, stay on-platform because staying is *easier*.

The economic backstop remains the 5% fee itself: the value surrendered by going around exceeds the saving.

### 2.7 Owner/ops dashboard

A dedicated "Operations" login shows: **GMV, platform revenue, funds held in escrow, quote-acceptance rate**; the full conversion funnel (posted → quoted → booked → paid → reviewed) with drop-off percentages; and four queues — needs-attention (disputes/stale), tradie **verification** (with one-click approve), **safety-gate overrides** (the prompt-drift early-warning system), and **contact-leakage attempts**.

### 2.8 Engineering quality

- TypeScript throughout (strict mode), Node/Express backend, React frontend, SQLite persistence.
- **106 automated tests** covering the safety gate (including jailbreak/regression cases), matching, state machines, payments/fee math, persistence, auth, the Copilot suite, multi-trade decomposition, certification, and the completion/anti-leakage flow.
- Clean seams where infrastructure will change: the payment provider, the LLM client, and storage are all swappable interfaces — Stripe/Claude/Postgres drop in without touching business logic.
- A fully self-contained interactive demo (no server needed) with four personas: **Alex** (homeowner), **Sam & Pat & Charlie** (electrician, plumber, carpenter), **Operations** (owner).

**Demo:** https://claude.ai/code/artifact/974e9ab6-47ba-4f8b-93a0-a53165303ab5 *(shareable via the page's share menu)* · **Code:** github.com/Meataxe4/Tradie (branch `claude/trades-marketplace-spec-909xxt`) · a public GitHub Pages URL is one settings toggle away.

---

## 3. What is outstanding — honest gaps

This is the oversight section. Nothing here is hidden in the demo; the items below are what separates the current build from a launchable product.

### 3.1 The AI currently runs on a deterministic simulation

Every AI feature works end-to-end today on a keyword-driven engine that mimics the real model (this is what makes the demo instant, free, and fully offline). The **real Claude integration is built** — multimodal photo analysis included — and activates with an API key. Before launch we need: (a) an inference budget (est. cents per triage; needs modelling against job volume), (b) an evaluation pass running our safety test suite against the live model, and (c) red-teaming of the triage prompt. **The safety gate applies identically to the live model** — that layer is not simulated.

### 3.2 Payments are mocked

The authorise/capture/fee logic is real and tested, but no money moves. Outstanding: **Stripe Connect** integration (onboarding trades as connected accounts, KYC), handling the ~7-day card-authorisation expiry vs. jobs scheduled further out (re-auth or save-card + charge-on-completion strategy), refunds and partial-capture dispute outcomes, GST-compliant receipts/invoices, and payout statements. *This is the single largest engineering item remaining.*

### 3.3 No notifications yet

The SLA countdowns, 48-hour confirmation window, and "we'll nudge them" promises currently rely on users opening the app (state is settled lazily and correctly, but nobody is pinged). Launch needs email/SMS/push: quote-ready, booking-confirmed, completion-confirmation requests, auto-release warnings, certificate prompts.

### 3.4 Operational automation gaps

- **Auto-reassign on quote SLA breach** (the manual decline-and-reassign is built; the timer-driven version needs a background job runner — same infrastructure as notifications).
- **Dispute resolution** is currently "ops resolves → capture." Real outcomes need refund/partial paths (depends on 3.2).
- **Licence verification is a manual flag.** NSW's public register (verify.licence.nsw.gov.au) has no public API; we need a manual/scripted onboarding check plus expiry monitoring — and, per the brief, an early conversation with Fair Trading about data access.
- Photo storage is inline in the database (fine for pilot volume; needs object storage before scale).

### 3.5 Production hardening

Deployment (hosting, HTTPS, secrets, backups), rate limiting/abuse protection, monitoring, and a proper Postgres migration path (the storage seam makes this straightforward).

### 3.6 Legal & regulatory (needs professional advice before launch)

The brief flags these and they remain open: the regulatory character of **holding customer funds**; marketplace **GST** obligations; **consumer-guarantee positioning** (platform vs. trade responsibility when a job goes wrong); Terms of Service & privacy policy; and verifying the exact Home Building Regulation DIY carve-outs clause-by-clause before the concierge states them as legal.

### 3.7 Strategic decision: mobile stack

The brief's locked target was **one Flutter codebase (iOS/Android/web) on Firebase**. What exists is a TypeScript/React web app — chosen for build speed, and it is mobile-responsive to a high standard. Decision needed: **(a)** ship the web app as a PWA for the pilot and port to Flutter after product-market signals, or **(b)** begin the Flutter port now. My recommendation is (a): the pilot's job is to validate triage quality, price-book accuracy and supply engagement, none of which need app stores.

### 3.8 Business operations (not software)

Foundation-cohort tradie recruitment (hand-built, volume-guaranteed per the brief); price-book seeding and validation with real trades; pilot unit economics (5% vs. Stripe cost + inference cost per job); expanded trade catalogue (painters, roofers, data cablers — architecture supports it as config, each needs its own vetting recipe).

---

## 4. Decisions requested

1. **Name:** confirm "Sorted By" (currently a working rebrand; code namespace still carries the old working title internally).
2. **Fee:** reconfirm 5% as the pilot stance (locked in the brief; flagged here because it must clear Stripe + inference costs).
3. **Mobile:** PWA-first pilot vs. Flutter port now (recommendation: PWA-first).
4. **Payments:** approve Stripe Connect as the provider and commission the funds-holding legal advice in parallel.
5. **AI go-live:** approve a live-model budget for an evaluation phase (safety suite + red-team against real Claude, with real photos).
6. **Launch wedge:** reconfirm Inner West + electrical/plumbing/carpentry, and greenlight foundation-tradie recruitment.

---

## 5. Suggested next milestones

| Milestone | Contents | Dependency |
|---|---|---|
| **M1 — Live brain** | API key wiring, safety-suite evaluation against the live model, photo red-team | Decision 5 |
| **M2 — Real money** | Stripe Connect, re-auth strategy, receipts, refunds, payout statements | Decisions 2, 4 |
| **M3 — Heartbeat** | Notification service (email/SMS/push) + scheduled jobs → SLA auto-reassign, auto-release reminders, certificate chasing | — |
| **M4 — Pilot** | Deploy hardened build, onboard foundation cohort, seed price book with them, run Inner West pilot with the ops dashboard as the control room | M1–M3, Decision 6 |

---

*Everything in Section 2 is verifiable right now in the interactive demo — log in as each of the four personas and walk the full loop: post a problem (try a photo, or "water leaking through the ceiling" for a multi-trade project, or "gas smell" for the emergency flow), accept the quote, raise and approve a variation, complete with the confirmation window, lodge the certificate, leave both reviews, then check the Operations dashboard to watch the money and the queues move.*
