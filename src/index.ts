/**
 * App entrypoint. Opens the SQLite database (durable across restarts), seeds
 * demo data, selects the triage LLM client, and — if the web frontend has been
 * built (web/dist) — serves it from the same origin.
 *
 * Persistence: set SQLITE_PATH to choose the file (default ./data/squiz.db), or
 * "off" / ":memory:" to run without a durable database.
 */
import { existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import Database from "better-sqlite3";
import { createApp } from "./api/app.js";
import { MemoryStore } from "./store/memoryStore.js";
import { createLlmClient } from "./config.js";
import { seed, seedDemoJobs } from "./seed.js";

const here = dirname(fileURLToPath(import.meta.url));
const webDist = resolve(here, "..", "web", "dist");
const staticDir = existsSync(webDist) ? webDist : undefined;

// --- database ---
const sqlitePath = process.env.SQLITE_PATH ?? resolve(here, "..", "data", "squiz.db");
const persist = sqlitePath !== "off" && sqlitePath !== "none";
let db: Database.Database | undefined;
if (persist) {
  if (sqlitePath !== ":memory:") mkdirSync(dirname(sqlitePath), { recursive: true });
  db = new Database(sqlitePath);
  db.pragma("journal_mode = WAL");
}

const store = new MemoryStore(db);
seed(store);
await seedDemoJobs(store);

const { client, kind } = createLlmClient();
const app = createApp({
  store,
  llm: client,
  staticDir,
  authSecret: process.env.AUTH_SECRET,
});

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(
    `Squiz API on :${port} (triage: ${kind}, storage: ${persist ? sqlitePath : "in-memory"})` +
      (staticDir ? " — serving web frontend" : " — API only (run `npm --prefix web run build` to serve the UI)"),
  );
});
