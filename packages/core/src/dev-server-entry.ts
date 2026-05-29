// TODO(TEMP): This file is a temporary studio placeholder for dev-server visualization.
// Remove when packages/studio/ is complete. Do NOT add production features here.

import { ChatServer } from "./chat-server.js";
import { HandlerEngine } from "./handler-engine.js";
import { createProvider } from "./llm/index.js";
import { InMemoryCheckpointStore } from "./checkpoint-store.js";
import { registerBuiltInProcessors } from "./processors.js";
import type { LLMProvider } from "./types.js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const SELF_AWARE_PROMPT = [
  "You are the Proteus Dev Server — a self-aware AI agent running inside the Proteus framework.",
  "",
  "## What is Proteus?",
  "Proteus is an event-driven agent loop framework for LLM-powered agents, written in TypeScript/Node.js.",
  "Its core idea: every agent interaction is a Turn with 5 phases, and every phase is a hook point for observability, pluggability, and self-modification.",
  "",
  "## Architecture",
  "- packages/core/ — Agent Loop runtime: HandlerEngine, Harness, CheckpointStore, Processors, ChatServer, LLM (provider + protocol)",
  "- packages/sdk/ — Embeddable language API (wraps core)",
  "- packages/server/ — HTTP/WebSocket service (Fastify v5, wraps core)",
  "- packages/studio/ — Browser UI (Vue 3 + Vite + Tailwind)",
  "",
  "## Key Concepts",
  "- Harness: orchestrates single-turn (runTurn) and multi-turn (runChain) execution through 5 phases",
  "- HandlerEngine: merged EventBus + HandlerRegistry. Handlers register with priority/trust/events. Supports interceptors and observers.",
  "- 5-phase Turn: context_assembly → llm_inference → action_resolution → tool_execution → result_observation",
  "- Three-Region Context: AgentContext (process) → SessionContext (session, persisted) → TurnContext (ephemeral per-turn)",
  "- WorkingMemory: conversation history stored in SessionContext, token-bounded",
  "- CheckpointStore: durable persistence (sessions, messages, checkpoints, event_log, config_snapshots, cost_records)",
  "- Self-Bootstrap: agent can modify itself at runtime — cognitive (prompt fragments) and behavioral (self_modify tool)",
  "- Handler return values: Go-style flow control — { ok }, { suspend }, { abort }, { error }",
  "",
  "## Current Dev Server",
  "You are running as the dev-server (dev-server-entry.ts). You have:",
  "- ChatServer with SSE streaming (token + thinking events)",
  "- LLM provider + protocol layer (OpenAI-compatible API, streaming, thinking)",
  "- JSON file persistence for chat history (~/.proteus/chat-data.json)",
  "- Thinking/reasoning separated from response content",
  "",
  "## Source Files (packages/core/src/)",
  "- harness.ts — Turn/Chain orchestration, phase execution loop",
  "- handler-engine.ts — HandlerEngine class, register/observe/emit",
  "- processors.ts — 5 built-in processors (one per phase)",
  "- chat-server.ts — HTTP server with /chat, /config, /sessions, /events endpoints",
  "- llm/provider.ts — Provider factory (auth + config → LLMProvider)",
  "- llm/protocols/openai-chat.ts — OpenAI Chat Completions protocol (fetch, SSE, thinking)",
  "- dev-server-entry.ts — Entry point, config resolution, processor registration",
  "- dev-server-ui.html — Three-panel UI (Config+Sessions | Chat | Visualizer)",
  "- context.ts — AgentContext, SessionContext, TurnContext, WorkingMemory, CostTracker",
  "- index.ts — Public API exports and type definitions",
  "",
  "Answer questions about the project accurately. If asked to modify code, explain which files need changes and why.",
].join("\n");

function loadEnvFile(): Record<string, string> {
  // Walk up from __dirname to find .env file
  let dir = path.dirname(new URL(import.meta.url).pathname);
  // On Windows, import.meta.url starts with /C:/ — normalize
  if (process.platform === "win32" && dir.startsWith("/")) dir = dir.slice(1);

  const result: Record<string, string> = {};
  while (dir !== path.dirname(dir)) {
    const envPath = path.join(dir, ".env");
    try {
      const raw = fs.readFileSync(envPath, "utf-8");
      for (const line of raw.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eqIdx = trimmed.indexOf("=");
        if (eqIdx === -1) continue;
        result[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim();
      }
      break;
    } catch {
      dir = path.dirname(dir);
    }
  }
  return result;
}

function createLLM(baseUrl: string, model: string, apiKey: string): LLMProvider {
  return createProvider({ baseUrl, model, apiKey, thinking: true, reasoningEffort: "high" });
}

function readClaudeConfig(): { baseUrl: string; model: string; apiKey: string } | null {
  const homeDir = os.homedir();
  const configPaths = [
    path.join(homeDir, ".claude", "settings.json"),
    path.join(homeDir, ".claude", "setting.json"),
  ];

  for (const configPath of configPaths) {
    try {
      const raw = fs.readFileSync(configPath, "utf-8");
      const config = JSON.parse(raw);
      const env = config.env ?? {};
      const rawBaseUrl = env.ANTHROPIC_BASE_URL ?? "";
      const apiKey = env.ANTHROPIC_AUTH_TOKEN ?? "";
      const rawModel = env.ANTHROPIC_MODEL ?? "";
      if (rawBaseUrl && apiKey && rawModel) {
        // Convert to OpenAI-compatible format: ensure /v1 suffix
        const baseUrl = rawBaseUrl.replace(/\/anthropic\/?$/, "/v1").replace(/\/v1\/?$/, "") + "/v1";
        // Remove [1M] or similar suffixes from model name
        const model = rawModel.replace(/\[.*\]/, "");
        return { baseUrl, model, apiKey };
      }
    } catch {
      // file doesn't exist or invalid JSON, try next
    }
  }
  return null;
}

function resolveLLM(): { llm: LLMProvider; config: { baseUrl: string; model: string; apiKey: string } } {
  // 1. Try env vars first
  const envApiKey = process.env.LLM_API_KEY ?? "";
  const envModel = process.env.LLM_MODEL ?? "";
  const envBaseUrl = process.env.LLM_BASE_URL ?? "";
  if (envApiKey && envBaseUrl && envModel) {
    console.log("  Using LLM config from environment variables");
    return { llm: createLLM(envBaseUrl, envModel, envApiKey), config: { baseUrl: envBaseUrl, model: envModel, apiKey: envApiKey } };
  }

  // 2. Try .env file
  const envFile = loadEnvFile();
  const envFileApiKey = envFile.LLM_API_KEY ?? "";
  const envFileBaseUrl = envFile.LLM_BASE_URL ?? "";
  const envFileModel = envFile.LLM_MODEL ?? "";
  if (envFileApiKey && envFileBaseUrl && envFileModel) {
    console.log(`  Using .env config: ${envFileModel}`);
    return { llm: createLLM(envFileBaseUrl, envFileModel, envFileApiKey), config: { baseUrl: envFileBaseUrl, model: envFileModel, apiKey: envFileApiKey } };
  }

  // 3. Try Claude Code config
  const claudeConfig = readClaudeConfig();
  if (claudeConfig) {
    console.log(`  Using Claude Code config: ${claudeConfig.model}`);
    return { llm: createLLM(claudeConfig.baseUrl, claudeConfig.model, claudeConfig.apiKey), config: claudeConfig };
  }

  // 4. No config found
  console.error("  No LLM config found. Create .env file (see .env.example) or set LLM_* env vars.");
  process.exit(1);
}

async function main() {
  const port = Number(process.env.PORT) || 3210;

  const engine = new HandlerEngine();
  const store = new InMemoryCheckpointStore();
  const { llm, config } = resolveLLM();

  // Data directory for persisting chat history
  const dataDir = path.join(os.homedir(), ".proteus");
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const server = new ChatServer({ port, llm, store, engine, llmFactory: createLLM, llmConfig: config, dataDir });

  // Register processors with token streaming callback + self-aware system prompt
  registerBuiltInProcessors(engine, {
    onToken: (token) => server.broadcastToken(token),
    onThinking: (token) => server.broadcastThinking(token),
    systemPrompt: SELF_AWARE_PROMPT,
  });

  const addr = await server.start();
  const actualPort = typeof addr === "string" ? addr : addr.port;

  console.log(`\n  Proteus Dev Server running at http://127.0.0.1:${actualPort}`);
  console.log(`  Endpoints:`);
  console.log(`    POST   /chat       — send a message`);
  console.log(`    POST   /config     — update LLM config`);
  console.log(`    GET    /sessions   — list sessions`);
  console.log(`    POST   /sessions   — create session`);
  console.log(`    DELETE /sessions/:id — destroy session`);
  console.log(`    GET    /events     — SSE stream\n`);
}

main().catch(console.error);
