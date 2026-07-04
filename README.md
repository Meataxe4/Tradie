# Squiz — Australian trades marketplace (MVP backend)

A two-sided marketplace where homeowners describe a household problem, an **AI
triages it**, and — for anything regulated or risky — the problem becomes a clean
job spec that verified tradies quote on privately.

This repository is the **MVP backend**, built from the [build spec](#spec). It
centres on the part the spec calls out as the reason the product is safe to ship:
the **AI triage safety policy and its server-side enforcement gate**.

> ⚠️ This is a build, not legal advice. Sections 1 and 10 of the spec need a
> lawyer before taking real jobs or money.

## The prime directive

> The AI must never give instructions to perform electrical, gas, or regulated
> plumbing work — and must never tell a user a hazard is "probably fine". When
> uncertain, it escalates to a licensed pro.

This is enforced **twice** (defence in depth):

1. In the model's own system prompt (`src/triage/systemPrompt.ts`, spec §3).
2. By a **server-side gate** that runs after the model and can only ever
   *escalate* risk (`src/triage/gate.ts`, spec §1.7). Even a jailbreak or model
   slip cannot emit illegal DIY instructions, because the gate:
   - forces `EMERGENCY_STOP` if any safety flag fires (§1.5);
   - forces at least `NEEDS_LICENSED_PRO` for any regulated category/domain (§1.4);
   - runs a banned-content scan over DIY guidance text (§1.7);
   - strips `diy_guidance` whenever the final verdict isn't `DIY_SAFE`;
   - logs every override for review (a spike = the prompt is drifting).

Escalation is **one-directional** (§1.1): `DIY_SAFE → NEEDS_LICENSED_PRO →
EMERGENCY_STOP`. The gate never rounds a verdict down. Triage failures **fail
closed** to `NEEDS_LICENSED_PRO` (`src/triage/triageService.ts`).

## Quick start

```bash
npm install
npm test          # 39 tests — the safety gate, matching, masking, state, full loop
npm run typecheck
npm start         # boots the API on :3000 (offline mock triage by default)
```

No API key is required: with no `ANTHROPIC_API_KEY` the app uses a deterministic,
keyword-driven mock triage client so the whole loop runs offline. Set the key
(see `.env.example`) to route triage through a real Claude model — the **gate runs
identically either way**.

### Try it

```bash
# Homeowner posts a dead power point → routed to a licensed electrician, no DIY steps
curl -s -X POST localhost:3000/jobs \
  -H 'content-type: application/json' -H 'x-user-id: home-1' -H 'x-user-role: homeowner' \
  -d '{"description":"A power point in the bedroom is dead","photos":["p1"],
       "suburb":"Newtown","postcode":"2042","state":"NSW","full_address":"1 Example St"}'

# Admin runs triage directly (see the model verdict, final verdict and overrides)
curl -s -X POST localhost:3000/triage \
  -H 'content-type: application/json' -H 'x-user-id: admin-1' -H 'x-user-role: admin' \
  -d '{"description":"strong gas smell in the kitchen"}'
```

Auth is an MVP stub: send `x-user-id` and `x-user-role` (`homeowner` | `tradie` |
`admin`) headers. Demo users are seeded (`src/seed.ts`): `home-1`, `admin-1`,
`spark-1` (NSW electrician), `plumb-1` (NSW plumber).

## Architecture

```
src/
  triage/          THE SAFETY CORE
    schema.ts        §2 output schema (zod-validated) + verdict ranking
    policy.ts        §1.3 allowlist, §1.4 blocklist, §1.5 flags, banned content
    gate.ts          §1.7 server-side gate (defence in depth)   ← start here
    systemPrompt.ts  §3 drop-in system prompt + §1.8 disclaimers
    llmClient.ts     LLM interface + deterministic MockTriageClient
    anthropicClient.ts  real Claude client (used when a key is set)
    triageService.ts    job → AI → gate → persist, fails closed
  domain/
    entities.ts      §5 data model
    stateMachines.ts §6 Job + Quote transitions
    matching.ts      §7 category + postcode + verified-licence matching
    contactMasking.ts §9 strips phone/email/off-platform contact
  services/
    marketplaceService.ts  the core loop (§6/§7/§9 orchestration)
  api/
    app.ts           §8 API surface (Express)
    views.ts         §9 masked read models (suburb-only until a tradie wins)
  store/memoryStore.ts   in-memory data + override & leakage audit logs
  config.ts, seed.ts, index.ts
```

Every module cites the spec section it implements. The LLM is behind an
interface, so the safety gate is fully unit-tested with no network.

## API surface (§8)

| Group | Endpoint | Notes |
|---|---|---|
| Homeowner | `POST /jobs` | create → triage → post/DIY-resolve |
| | `GET /jobs/:id` | own job incl. triage + DIY guidance |
| | `GET /jobs/:id/quotes` | private, sealed quote list |
| | `POST /quotes/:id/accept` | auto-declines the rest, reveals address, books |
| Tradie | `GET /leads`, `GET /leads/:id` | matched jobs, homeowner masked |
| | `POST /jobs/:id/quotes` | submit a sealed quote |
| | `GET /me/leads/won` | won bookings |
| Shared | `POST /threads/:id/messages` | masked in-app chat |
| | `POST /bookings/:id/complete`, `POST /bookings/:id/review` | review only after completion |
| | `POST /triage` | run triage without persisting (internal/admin) |
| Admin | `GET /admin/override-log`, `/admin/leakage-log`, `/admin/verification-queue` | |

## §12 decisions taken for this MVP

These were left open in the spec; sensible defaults were chosen to keep building
and are easy to revisit:

- **Stack:** TypeScript + Node + Express + Vitest, in-memory store (swap for
  Postgres later — services depend only on `MemoryStore`'s methods).
- **Conservative AI line (§1):** adopted as non-negotiable and enforced in the gate.
- **Homeowner anonymous pre-acceptance:** yes (suburb only; address revealed to
  the winning tradie on `BOOKED`).
- **Launch scope assumed:** NSW, categories electrical / plumbing / handyman
  (reflected in the seed + matching examples).
- **Payments/escrow:** deferred to v1 per the spec's phased build (§11); the
  "founding-tradie free access" posture is implied (no pay-to-compete).

## What's deliberately not here yet (per §11)

Stripe Connect escrow, automated multi-state licence verification, availability
calendars, and a frontend. Manual licence verification is modelled
(`LicenceVerification`, admin verification queue) rather than automated.

<a name="spec"></a>The full build spec lives in the task that created this repo
and remains the source of truth.
