# Sorted By — working notes for agents

An Australian AI-concierge trades marketplace. A homeowner describes a problem in
plain words; triage decides DIY / needs-a-pro / emergency; needs-a-pro gets one
assigned vetted trade with one firm price. Payment is authorised at booking and
charged on completion.

## Read these before writing anything user-facing

**`docs/brand/VOICE_GUIDE.md`** — the distilled style and voice guide (v2.1). Colour
tokens, type scale, logo rules and the say/not table. It governs every word and pixel
a homeowner or tradie sees. `docs/brand/Sorted_By_Style_and_Voice_Guide_v2.1.pdf` is
the authority behind it; the markdown exists so the rules are cheap to read.

The four that get broken most often:

- **Sentence case** for headings, buttons and menus. Capitals only for the Label style.
- **Prices include GST, once per screen**: `$385 inc. GST`. Never "from" on a firm quote.
- **Never** escrow / pre-authorisation / vetted pro / trusted expert / service provider.
  Say "We're holding $385 until it's done" and "Licensed plumber, licence 123456C".
- **Spritz never warns.** Orange means go ahead; hazards use Alarm. Buttons on Spritz
  take Ink text — white on Spritz fails contrast at 3.4:1.

## Safety architecture — change-controlled

`src/triage/gate.ts` needs sign-off from **both Blake and Phil**. It is a server-side,
escalate-only gate: any active safety flag forces EMERGENCY_STOP, regulated categories
force at least NEEDS_LICENSED_PRO, and DIY steps are stripped whenever the verdict
isn't DIY_SAFE. Photos, captions and property context can only raise risk, never lower
it. Guest triage runs the full gate — safety guidance must never sit behind a signup
wall.

Safety and emergency copy comes word for word from the safety policy, **not** from the
voice guide. Don't restyle it for tone.

## Stack

Node + TypeScript (strict), Express, SQLite behind a swappable store seam. React +
Vite SPA, hand-rolled CSS design system, no UI framework. Claude behind a swappable
client seam — deterministic keyword mock today, live API when funded (decision D5).
Payments: provider seam, mock today, designed for Stripe Connect.

**The demo mirrors the backend.** `web/src/demo/mockServer.ts` reimplements the API
in the browser. Every backend change needs the mock updated too, or the demo silently
diverges from the product.

## Workflow

1. Feature branch off `origin/main`.
2. Commit, push, open a PR into `main`, merge it.
3. Rebuild and publish the demo (below).
4. Sync the old default branch (below).

```bash
npx vitest run                      # 130 tests, from the repo root
cd web && npx tsc --noEmit          # strict, must be clean
cd web && npm run build:demo        # -> web/dist-demo/index.html, one self-contained file
```

Publish by copying `web/dist-demo/index.html` to gh-pages as **both** `index.html` and
`b/index.html` — `b/` is kept alive so links shared during the old A/B test still work.

**The repo's default branch is still `claude/trades-marketplace-spec-909xxt`**, not
`main`. Until someone flips it in Settings, PRs opened in the GitHub UI target the
wrong branch, so after every merge:

```bash
git checkout claude/trades-marketplace-spec-909xxt && git pull && git merge origin/main && git push
git diff --stat origin/main origin/claude/trades-marketplace-spec-909xxt   # empty = in sync
```

## Environment quirks that waste time

- `node_modules` disappears mid-session. If tsc or vitest suddenly can't resolve
  modules, run `npm ci` (root and/or `web/`) and carry on — it isn't a code problem.
- Verify UI changes headlessly before claiming they work. Playwright lives at
  `/opt/node22/lib/node_modules/playwright`, Chromium at
  `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`. Drive the built demo over
  `file://` or a local http server. **Test the user's actual path**, not just that the
  feature exists in isolation — that is how bugs have slipped through before.
- React controlled inputs need Playwright `.fill()`, not `element.value =`.
- `text-transform` uppercases `innerText`, so assert case-insensitively.
- gh-pages caches hard; hard-refresh or add `?v=N`.
- The egress proxy blocks some domains and all repo-settings writes. Never route around
  a denial — ask Blake to do it in the UI.

## Commits

Use the trailer convention already in `git log` (Co-Authored-By + Claude-Session).
Never put a model identifier in repo artifacts.
