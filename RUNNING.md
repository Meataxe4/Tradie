# How to run Squiz locally

A step-by-step guide, written for someone who hasn't run a Node project before.

## Step 0 — Install what you need (one time)

You need **Node.js** (v20 or newer) and **Git**.

Check whether you already have them — open a terminal (macOS: the **Terminal**
app; Windows: **PowerShell**) and run:

```bash
node --version
git --version
```

If both print a version number (Node must be **v20 or higher**), skip to Step 1.

Otherwise install:
- Node.js — https://nodejs.org (click the **LTS** button)
- Git — https://git-scm.com/downloads

Close and reopen your terminal after installing.

## Step 1 — Download the code (one time)

```bash
git clone https://github.com/Meataxe4/Tradie.git
cd Tradie
git checkout claude/trades-marketplace-spec-909xxt
```

## Step 2 — Install the app's parts (one time)

```bash
npm install
```

This installs **both** the backend and the `web/` frontend (a `postinstall`
step handles the frontend automatically). A few "vulnerability" warnings are
normal for a local preview and safe to ignore.

## Step 3 — Run it

```bash
npm run dev
```

Leave this terminal running. It starts two things together:
- the **API** on http://localhost:3000
- the **web app** on http://localhost:5173

## Step 4 — Open it

Go to **http://localhost:5173** in your browser.

You'll see a sign-in screen. Either **create an account** (choose "I need a job
done" or "I'm a tradie"), or — fastest — click a **demo account** under "or try
instantly": **Alex** (homeowner), **Sam** (electrician), or **Pat** (plumber).

As a homeowner:
1. Click an example problem → **Continue** → **Get triage**.
   - *"A power point in the bedroom has stopped working"* → routed to a licensed
     electrician (no DIY steps) + the safety-gate panel.
   - *"My kitchen cabinet door won't close"* → a safe DIY answer with steps.
   - *"There's a strong gas smell in the kitchen"* → an emergency-stop response.
2. Click **Switch** (top-right) → pick **Inner West Electrical** (a tradie) →
   see the job as a matched lead and submit a sealed quote.

## Step 5 — Stop it

Click the terminal and press **Ctrl + C**.

## Running it again later

Steps 0–2 are one-time. After that:

```bash
cd Tradie
npm run dev
```

## Other ways to run

```bash
# One server on :3000 that serves the API AND the built web UI:
npm run build:web
npm start
# then open http://localhost:3000

# Backend only (no UI), e.g. for curl/Postman:
npm run dev:api

# Run the tests:
npm test
```

By default triage uses an offline mock (no API key needed). To use a real Claude
model, copy `.env.example` to `.env` and set `ANTHROPIC_API_KEY` — the
server-side safety gate behaves identically either way.

## Troubleshooting

- **`port already in use`** — another copy is running. Close other terminals
  running the app (Ctrl + C), or restart your computer.
- **`node` / `npm: command not found`** — Node isn't installed correctly; redo
  Step 0 and reopen your terminal.
- **Nothing loads at localhost:5173** — check the `npm run dev` terminal is
  still open and shows no error; give it ~10 seconds after starting.
