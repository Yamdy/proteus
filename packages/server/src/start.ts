// @proteus/server — Standalone entry point for starting the server

import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import {
  createInMemoryStore,
  createSqliteStore,
  createProvider,
  MetricsCollector,
} from "@proteus/core";
import { createServer } from "./server.js";

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? "0.0.0.0";

// --- LLM Provider (env vars or hardcoded defaults for dev) ---
const apiKey = process.env.PROTEUS_LLM_API_KEY
  ?? process.env.OPENAI_API_KEY
  ?? "sk-20717116e9be442f8e8ebb16d5a30f9a";
const baseUrl = process.env.PROTEUS_LLM_BASE_URL ?? "https://api.deepseek.com";
const model = process.env.PROTEUS_LLM_MODEL ?? "deepseek-v4-pro";

const llm = apiKey
  ? createProvider({ baseUrl, apiKey, model, temperature: 0.7 })
  : undefined;

if (!llm) {
  console.warn("[proteus-server] No LLM API key set — chat/stream endpoints will use fallback echo");
}

// --- Stores ---
const dbPath = process.env.PROTEUS_DB_PATH ?? "./data/proteus.db";
const useMemory = process.env.PROTEUS_STORE === "memory";
if (!useMemory) {
  mkdirSync(dirname(dbPath), { recursive: true });
}
const store = useMemory ? createInMemoryStore() : createSqliteStore(dbPath);

const metrics = new MetricsCollector();

const server = createServer({
  port,
  host,
  store,
  sessionStore: store,
  metrics,
  costStore: store,
  eventLog: store,
  llm,
});

server.start().then(() => {
  console.log(`[proteus-server] listening on http://${host}:${port}`);
  if (llm) {
    console.log(`[proteus-server] LLM configured: ${model} @ ${baseUrl}`);
  }
}).catch((err) => {
  console.error("[proteus-server] failed to start:", err);
  process.exit(1);
});
