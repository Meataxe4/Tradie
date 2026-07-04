/**
 * App entrypoint. Boots the Express API with an in-memory store, seeds demo
 * data, selects the triage LLM client, and — if the web frontend has been built
 * (web/dist) — serves it from the same origin.
 */
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createApp } from "./api/app.js";
import { MemoryStore } from "./store/memoryStore.js";
import { createLlmClient } from "./config.js";
import { seed, seedDemoJobs } from "./seed.js";

const here = dirname(fileURLToPath(import.meta.url));
const webDist = resolve(here, "..", "web", "dist");
const staticDir = existsSync(webDist) ? webDist : undefined;

const store = new MemoryStore();
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
    `Squiz API on :${port} (triage: ${kind})` +
      (staticDir ? " — serving web frontend" : " — API only (run `npm --prefix web run build` to serve the UI)"),
  );
});
