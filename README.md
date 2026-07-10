# Sorted By — AI-concierge trades marketplace

A two-sided marketplace that gets the customer **sorted**: describe a household
problem, an **AI concierge** triages it, and — for anything regulated or risky —
the job is **assigned to one vetted trade** with a **firm, GST-inclusive quote**.
Accept in a tap; the money is **held securely** and released on completion, with
a **5% platform fee** and **structured two-way ratings**.

Built from the product brief. Working prototype on **TypeScript + Node + Express
+ SQLite** with a **React** frontend (the brief's eventual Flutter/Firebase
target is a separate future port). What it delivers today:

- **AI concierge triage + safety gate** — safe DIY, or a routed job; hazards
  short-circuit to an urgent-safety path (the reason it's safe to ship).
- **Assigned firm quotes + price book** (§3) — one trade per job, no auctions;
  common jobs get an instant price-book quote, the rest are routed for a firm one.
- **Held payment + 5% fee + variations** (§3/§6) — authorise at booking, capture
  on completion, fee computed server-side in AUD cents; in-app variations.
- **Structured two-way ratings** (§4) — multi-dimension, verified-paid, both
  directions, with strengths surfaced on profiles.
- **Vetting surfaced** — licence class + expiry + insurance on every trade.

> ⚠️ This is a build, not legal advice. The NSW licensing/compliance and ACL
> positioning need a lawyer before taking real jobs or money.

**Live demo (no install):** the whole app runs in your browser at the shared
Artifact link — landing, sign-up, concierge triage, firm quote, held payment,
variations, and ratings, all against an in-browser mock. `npm run build:demo`
regenerates it as a single self-contained `web/dist-demo/index.html`.

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

New to Node projects? See **[RUNNING.md](RUNNING.md)** for a step-by-step guide.

```bash
npm install       # also installs the web/ frontend (postinstall)
npm test          # 41 tests — the safety gate, matching, masking, state, full loop
npm run typecheck
npm run dev       # API on :3000 + web UI on :5173 (open http://localhost:5173)
```

Open **http://localhost:5173** and pick a demo identity (homeowner or tradie) to
walk the whole flow. `npm run dev` runs the API and the Vite dev server together;
the frontend proxies `/api` to the backend so there's no CORS.

**Single-server / production mode:**

```bash
npm run build:web   # builds web/ into web/dist
npm start           # Express serves the API *and* the built UI on :3000
```

**Live demo (no backend):** `npm run build:demo` produces a single
self-contained file at `web/dist-demo/index.html` — the real app bundled with an
**in-browser mock API** (`web/src/demo/`). Open it directly in any browser (or
host it anywhere static) to click through the whole product — landing, sign-up /
login, AI triage, sealed quotes, messaging — with no server. The theme defaults
to **light**, with a dark toggle in the top bar.

**Persistence:** state is stored in SQLite at `./data/squiz.db` by default and
**survives restarts** — accounts, jobs, quotes and bookings are all durable. Set
`SQLITE_PATH` to change the file, or `SQLITE_PATH=off` (or `:memory:`) to run
without a database. Tests use in-memory Maps, so they stay fast and isolated.

No API key is required: with no `ANTHROPIC_API_KEY` the app uses a deterministic,
keyword-driven mock triage client so the whole loop runs offline. Set the key
(see `.env.example`) to route triage through a real Claude model — the **gate runs
identically either way**.

### Try it

All API routes are under `/api`. Requests authenticate with a **Bearer token**
obtained from `/api/auth/login`, `/api/auth/register`, or the one-click
`/api/auth/demo/:id`.

```bash
# 1) Grab a token for a seeded demo account (no password needed)
TOKEN=$(curl -s -X POST localhost:3000/api/auth/demo/home-1 | node -pe 'JSON.parse(require("fs").readFileSync(0)).token')

# 2) Homeowner posts a dead power point → routed to a licensed electrician, no DIY steps
curl -s -X POST localhost:3000/api/jobs \
  -H 'content-type: application/json' -H "authorization: Bearer $TOKEN" \
  -d '{"description":"A power point in the bedroom is dead","photos":["p1"],
       "suburb":"Newtown","postcode":"2042","state":"NSW","full_address":"1 Example St"}'
```

**Auth** (`src/auth/`): email + password with scrypt-hashed passwords and HS256
session tokens (Node `crypto`, no external deps). New tradie accounts start
`pending` and won't match jobs until verified (§10). Seeded demo accounts
(`src/seed.ts`) are reachable via one-click demo login: `home-1`, `spark-1` (NSW
electrician), `plumb-1` (NSW plumber), `admin-1`.

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
  auth/
    passwords.ts     scrypt password hashing
    tokens.ts        HS256 JWT sign/verify
    authService.ts   register / login / demo-login over the store
  store/
    kvMap.ts         Map-compatible interface + SqlMap (better-sqlite3 backed)
    memoryStore.ts   the collections; native Maps, or SqlMaps when given a DB
  config.ts, seed.ts, index.ts

web/               REACT FRONTEND (Vite + TypeScript)
  src/api.ts         typed API client (injects the x-user-* auth headers)
  src/ui.tsx         verdict banner, safety-gate panel, icons
  src/views/         Login, NewJob, Jobs, JobDetail, Leads, LeadDetail, Thread
  src/styles.css     shared design system (theme-aware, matches the brand)
```

Every module cites the spec section it implements. The LLM is behind an
interface, so the safety gate is fully unit-tested with no network.

## Frontend

A React SPA (`web/`) for both roles, sharing the backend's visual language:

- **Homeowner** — describe a problem → see the triage verdict, DIY steps *or* the
  job spec, and the live safety-gate panel; browse jobs; read private sealed
  quotes; accept one (address reveals); message (masked); review after completion.
- **Tradie** — see matched leads (homeowner masked, address hidden), submit a
  sealed quote, message, and track won jobs.

Sign-in is a demo identity picker (real auth is a v1 item). The whole flow has
been driven end-to-end in a real browser in both light and dark themes.

## API surface (§8) — all under `/api`

| Group | Endpoint | Notes |
|---|---|---|
| Auth | `POST /api/auth/register`, `/login`, `/demo/:id` | returns `{ token, user }` |
| | `GET /api/me` | current user + profile (Bearer token) |
| Homeowner | `POST /api/jobs` | create → triage → post/DIY-resolve |
| | `GET /api/jobs`, `GET /api/jobs/:id` | own jobs; detail incl. triage + booking |
| | `GET /api/jobs/:id/quotes` | private, sealed quote list |
| | `POST /api/quotes/:id/accept` | auto-declines the rest, reveals address, books |
| Tradie | `GET /api/leads`, `GET /api/leads/:id` | matched jobs, homeowner masked |
| | `POST /api/jobs/:id/quotes` | submit a sealed quote |
| | `GET /api/me/quotes`, `GET /api/me/leads/won` | own quotes; won bookings |
| Shared | `GET/POST /api/threads/:id/messages` | masked in-app chat |
| | `POST /api/bookings/:id/complete`, `.../review` | review only after completion |
| | `POST /api/triage` | run triage without persisting (internal/admin) |
| Admin | `GET /api/admin/override-log`, `/leakage-log`, `/verification-queue` | |
| System | `GET /api/demo/identities` | seeded demo logins for the UI picker |

## §12 decisions taken for this MVP

These were left open in the spec; sensible defaults were chosen to keep building
and are easy to revisit:

- **Stack:** TypeScript + Node + Express + Vitest. **Persistence via SQLite**
  (better-sqlite3) behind a Map-compatible interface, so the whole synchronous
  codebase is durable without an async rewrite; tests run on in-memory Maps.
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
