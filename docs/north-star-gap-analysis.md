# North Star ↔ Build — Gap Analysis

*Prepared by Blake's Claude, 15 July 2026, against the North Star paper of 10
July 2026 and the MVP build (main @ 14c9780, 106 tests). For Blake + Phil to
review; anything actioned goes through the Decisions Log.*

## Verdict

The build and the North Star agree on fundamentals to an unusual degree — Idea
2 (quote → book → pay) is essentially built end-to-end, and the safety,
no-surprises and auditability principles are enforced in code, not copy. The
real gaps cluster in Idea 3's "ask once / profiles do the remembering", the
conversational depth of the concierge, and "real booking time". Nothing in the
paper contradicts the M1–M4 plan; it re-weights what M2/M3 must contain and
adds one new workstream (profiles).

## Where the build already delivers the North Star

| North Star element | Build status |
|---|---|
| Firm GST-inclusive price up front (price-book + routed custom) | Built, tested |
| Payment held at booking, released on completion | Built (mock provider; Stripe = M2) |
| Scope changes approved in-app before work proceeds | Built (variations) |
| Vetted trades: licence class/expiry/insurance verified & displayed | Built (trust rows, matching hard-filters, verify queue) |
| Structured two-way ratings on verified paid jobs | Built |
| Certified work under Australian standards | Built (NSW certificate layer: CCEW / gas / plumbing CoC) |
| Safe DIY for small jobs; never DIY for licensed/unsafe work; hazards → urgent help | Built (allowlist, escalate-only gate, emergency takeover with tap-to-call) |
| Project split across trades when more than one is needed | Built (multi-trade projects, safety-first decomposition) |
| No surprises: ballpark ranges, over-range explanations, confirm-before-hold | Built |
| Tradie never chases an invoice | Built (confirm-or-auto-release; funds *automation* itself = M2) |
| Money/trust/safety logic server-side; overrides/leakage/payments logged | Built |
| Start small: Inner West, three trades, hand-picked network | Matches launch plan |

## Gaps (ranked by distance from the North Star)

**G1 — "Ask once" is not yet true.** The paper: *"Anything the customer or
tradie has already told us … is never asked for again."* Today the new-job
wizard asks suburb/postcode/address every time (defaults are hard-coded, not
drawn from the profile), and there is no property profile at all. The paper's
version is also a safety asset: property details (e.g. build era) feed triage
— a pre-1990 home is an asbestos-era signal we currently only get if the
customer volunteers it. **Proposed: new workstream — customer property profile
+ prefill-everywhere + job history feeding the concierge.** Small-to-medium
build; high North-Star weight.

**G2 — The concierge is one-shot, not conversational.** The paper: *"It asks
the right questions, takes photos and manuals"* — i.e. an intake dialogue.
Today triage is a single pass; clarifying questions surface only on an
UNCLEAR verdict and there's no answer-and-refine loop, and no manuals/PDF
intake. **Proposed: fold into M1 (Live brain)** — a conversational intake is
exactly what the live model enables, and it should be evaluated/red-teamed as
one piece with it.

**G3 — "A real booking time" is soft.** Availability is a friendly label
("Tomorrow arvo"), not a scheduling commitment; nothing blocks double-booking
and the customer never picks from the tradie's actual slots. **Proposed: add
lightweight scheduling to M3 (Heartbeat)** — it shares the
notifications/calendar infrastructure.

**G4 — Success metric not yet instrumented.** *"First-time customer accepts a
firm quote within a day, rates the job highly — and both come back."* The ops
dashboard has the funnel but not median time-to-accept, first-job rating, or
repeat rate (the data exists; book-again is built to drive repeats).
**Proposed: add the three North-Star KPIs to the admin dashboard.** Small.

**G5 — Audit trail exists but isn't reconstructable in one view.** Every event
is stored (triage, overrides, quote, booking, variations, payment, certificate,
ratings) but no single per-job timeline stitches them. **Proposed: per-job
audit view (admin), backlog.** Small.

## One thing to resolve, not build

The paper is headed **SORTED BY** but carries *"working name: Tradie Now"*.
The build, demo, and all documents currently say Sorted By. This is Decision
**D1** in the Masterplan — flagging that the two artefacts disagree so Blake
and Phil settle it explicitly.

## Implications for the milestone plan

- **M1 (Live brain)** grows: + conversational intake (G2), photos *and
  manuals*, evaluated together with the live-model safety pass.
- **M2 (Real money)** confirmed and sharpened: "guaranteed fast payment,
  easy to reconcile" makes payout statements/reconciliation first-class M2
  scope, not a fast-follow.
- **M3 (Heartbeat)** grows: + real booking slots (G3). Notifications remain
  the core — "minutes, not days" is impossible without them.
- **New: M2.5 "Profiles & ask-once" (G1)** — can run parallel to M2; no
  dependency on payments or live AI.
- **M4 (Pilot)** unchanged; add the North-Star KPIs (G4) to the dashboard
  before pilot start so the success metric is measured from day one.

*Update 15 Jul 2026: D7 (adopt this plan into the milestones) APPROVED by
Blake; Phil's countersignature pending in the Decisions Log. M2.5 (Profiles &
ask-once) started first — no dependencies.*
