/**
 * App entrypoint. Boots the Express API with an in-memory store, seeds demo
 * data, and selects the triage LLM client based on the environment.
 */
import { createApp } from "./api/app.js";
import { MemoryStore } from "./store/memoryStore.js";
import { createLlmClient } from "./config.js";
import { seed } from "./seed.js";

const store = new MemoryStore();
seed(store);

const { client, kind } = createLlmClient();
const app = createApp({ store, llm: client });

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(
    `Squiz marketplace API listening on :${port} (triage backend: ${kind})`,
  );
});
