# Proteus — Domain Glossary

## Core Concepts

### Agent Loop
The fundamental execution model. A `while` loop where each iteration: LLM receives context → selects tool/action → executes → result feeds back into next iteration. This is the atomic unit of Proteus's runtime. All observability, pluggability, and extensibility are defined relative to this loop's lifecycle.

### Turn
One iteration of the Agent Loop. A Turn has five stages, each serving as a hook anchor point:

1. **Context Assembly** — assemble prompt + history; supports dynamic prompt fragment loading (cognitive self-modification)
2. **LLM Inference** — call LLM API
3. **Action Resolution** — parse LLM output into concrete actions
4. **Tool Execution** — execute tool calls; includes the `self_modify` tool (behavioral self-modification)
5. **Result Observation** — incorporate results back into context

### Chain (链路)
The full lifecycle from user input to final output, composed of one or more Turns. Also called "full-chain" (全链路) when emphasizing end-to-end observability/pluggability/extensibility.

### Session
A conversation container with independent configuration. The primary unit of user interaction — like a chat window, but with workspace-level isolation for config and state.

Key properties:
- **Owns**: Working Memory, Conversations (each containing multiple Chains), Level 0-2 config, Git workspace (for self_modify artifacts)
- **Does NOT own**: Agent Loop, Plugin Engine, OTel pipeline — these are shared across Sessions

Multiple Sessions can share one Agent Loop runtime (especially in Server mode). self_modify changes are scoped to the Session's own git workspace — Session A's self-modification does not affect Session B.

SDK mode: typically one Session per process. Server mode: one Session per user connection, multiple Sessions per Agent Loop (multi-tenant isolation).

### Agent Loop Concurrency

- **Per-Session**: Turns are serial. One Turn at a time per Session — no parallel Turns within the same Session.
- **Deduplication**: concurrent calls targeting the same Session are deduplicated and return the same result (computation sharing, not re-execution).
- **Cross-Session**: multiple Sessions can process Turns concurrently on the same Agent Loop. Events (OTel spans, logs, hooks) are routed by sessionID to prevent cross-Session pollution.

### Conversation
A sequence of Chains within a Session, representing one continuous dialogue thread. A Session can have multiple Conversations; Working Memory can be shared or isolated across them (configurable).

### Self-Bootstrap (AI自举)
The agent's ability to modify itself at runtime. Dual-channel:
- **Cognitive channel**: dynamic prompt fragment loading at Context Assembly stage (modifies "what the agent thinks")
- **Behavioral channel**: `self_modify` tool at Tool Execution stage (modifies "what the agent can do")

### Stage Execution Model
Each Turn stage executes with three mechanisms:

1. **Gate** — onion-model middleware layer. Receives Readonly context + `next_handler`. Can short-circuit by not calling `next_handler`. Used for cross-cutting interception (rate limiting, permission, quota, cost gating). Multiple Gates per stage, wrapping the Processor.
2. **Processor** — the stage's core business logic. Receives Writable context, no `next_handler`. Cannot short-circuit. Exactly one Processor per stage. This is what the stage "does."
3. **Transformer** — sequential pipeline for pure data transformation (no before/after semantics). Used for system prompt assembly. Each Transformer receives the previous one's output.

Boundary rules (enforced by TypeScript types):
- Need to modify context → Processor
- Need to intercept/deny → Gate
- Need to transform data → Transformer
- Only need to observe → EventStore

### EventStore
Immutable fact broadcast and persistence. Push-mode: events are emitted after each Gate/Processor execution, subscribers receive them asynchronously. Used for observability (OTel bridge), audit logging, and UI streaming. Events are NOT used for interception or flow control — that is Gate's responsibility.

### Schema System (Zod)
Zod is the single source of truth for all runtime schemas. Zod schemas derive:
- **JSON Schema** — for LLM tool definitions (via `zod-to-json-schema`)
- **TypeScript types** — via `z.infer<typeof Schema>`
- **Runtime validation** — at trust boundaries (Gate I/O, Processor results, Config, SDK API inputs, self_modify generated code)

Tool parameter definitions use Zod schemas. Vercel AI SDK integration is zero-friction (it natively accepts Zod schemas).

### Three-Layer Architecture

Proteus ships as three layers:

1. **Core** — the shared runtime: Agent Loop, Hook/Plugin engine, observability pipeline, self-boostrap mechanism. A standalone library with no IO or transport concerns.
2. **SDK** — embeds Core and exposes it as a programming language API. For embedding Proteus inside another application (e.g., another AI agent). Runs a single Agent Loop instance in-process.
3. **Server** — embeds Core and wraps it with a service shell: HTTP/WebSocket API, session management, multi-tenant isolation, persistence, and Studio API. Serves multiple concurrent clients. V1: HTTP + WebSocket only; gRPC deferred to a future version.

SDK and Server share the same Core; they differ only in how they expose it (language API vs. network API) and what operational concerns they add.

**Persistence:** Core defines a persistence interface; Server provides the default implementation using SQLite (`better-sqlite3`). Persisted data: Session configs (Level 0-2), Working Memory (conversation history). `self_modify` artifacts persist via git repo (separate mechanism). SDK mode: persistence is optional and user-configurable (in-memory by default). V2 may introduce Postgres as an alternative implementation.

### Tech Stack
Language: TypeScript / Node.js. Rationale: shared language for Core + SDK + Server + Studio frontend; AI-generated TS code is reliable; npm plugin ecosystem; IO-bound Agent Loop suits Node's event loop. Minimum Node.js version: 20 (Active LTS). TypeScript target: ES2023, module: NodeNext. Testing: Vitest (unit + integration, all packages).

### Configuration Levels

Proteus configuration spans three levels; Level 3 is an invariant:

- **Level 0 — Static Config** (JSON/YAML): LLM provider/model/temperature, tool enable/disable, log levels. Studio exposes as forms. `self_modify` cannot touch.
- **Level 1 — Declarative Orchestration** (JSON Schema / YAML pipeline): plugin registration order, Observer/Interceptor priorities, prompt templates with variable bindings. Studio visualizes and edits. `self_modify` can change.
- **Level 2 — Code-Level Config** (TypeScript functions): custom Interceptor logic, custom Tool implementations, custom Context Assembly strategies. Studio provides code editor. `self_modify` can generate.
- **Level 3 — Core Runtime** (invariant): Agent Loop behavior, Hook/Plugin engine mechanics. No configuration, no modification. This is Proteus's "laws of physics."

### Plugin Isolation Tiers

Gate and Processor extensions run at one of four isolation levels, determined by trust:

| Tier | Name | Runtime | Node.js API | Use Case |
|------|------|---------|-------------|----------|
| 0 | Observer | Same process, read-only | Full, but read-only context | OTel collectors, loggers |
| 1 | Trusted | Same process | Full | User-authored / built-in |
| 2 | Isolated | Worker Thread | Full, crash-isolated | Community npm plugins, self_modify (V1) |
| 3 | Sandboxed | VM (isolated-vm) | Restricted (injected API only) | self_modify (V2, deferred) |

Plugin declares its trust level via manifest; user can override at registration time (upgrade or downgrade). In V1, `self_modify` plugins run at Tier 2 (Worker Thread); the non-overridable Tier 3 constraint applies from V2 onward when isolated-vm is introduced. V1 does not depend on `isolated-vm`.

**Worker Thread Communication (Tier 2):** The main thread owns all mutable state. Workers never receive the full context — they receive only the minimal parameters needed for the current Gate/Processor invocation. Workers return structured deltas/patches, not mutated context objects. Gate `next_handler` chains execute on the main thread; the Worker is a middleware node that receives → transforms → returns.

### Observability Model (OTel)

Trace = Chain, Span = Turn, Child Span = Stage. Granularity stops at Stage level; finer spans are opt-in via `tracer.startSpan()` in custom plugins. The sole exception: `self_modify` tool is auto-expanded internally (generate → validate → register → hot-load) because self-boostrap must be fully transparent.

**OTel SDK isolation:** `@opentelemetry/*` packages are internal implementation details of Core. Core defines its own observability interfaces (`ProteusTracer`, `ProteusSpan`, `ProteusMetric`); the OTel JS SDK provides the default implementation. Core's public exports never reference OTel types (`Span`, `Context`, `Tracer`, etc.). This mirrors the `LLMProvider` pattern — same principle, same benefit: pre-1.0 OTel SDK upgrades only affect the internal adapter layer.

| OTel Signal | Proteus Mapping | Examples |
|---|---|---|
| Trace | Chain | one user task end-to-end |
| Span | Turn | one LLM loop iteration |
| Child Span | Stage | Context Assembly / LLM Inference / Action Resolution / Tool Execution / Result Observation |
| Metric (Counter) | Turn count, Tool call count, Token consumption | `proteus.turn.total`, `proteus.tool.tokens` |
| Metric (Histogram) | Turn duration, LLM latency, Tool execution time | `proteus.turn.duration`, `proteus.llm.latency` |
| Metric (Gauge) | Active Chains, Context window utilization | `proteus.chain.active`, `proteus.context.utilization` |
| Log | Observer events at each Hook + custom logs | Structured JSON, auto-correlated by trace_id |

### Self-Modify Safety (Minimal)

Git-based snapshots + Watchdog process. No approval flow, no policy engine, no shadow mode (extensible later via plugins).

**Git Snapshots**: all self_modify artifacts (Level 1 config + Level 2 code) live in a git repo. Before hot-load, Proteus auto-commits with trace_id in the message. Rollback = `git revert`. Studio shows self-boostrap history as git log + diff.

**Watchdog**: a separate process, fully decoupled from Agent Loop. Communicates via HTTP heartbeat — periodically calls Agent's health endpoint. If Agent is unresponsive or metrics exceed thresholds (Level 0 config), Watchdog independently executes `git revert` on the session's git repo. Watchdog only needs: git repo path + anomaly thresholds. Does not depend on Agent being alive.

**Not built yet** (future plugin extensions): approval policies, shadow Turns, automated strategy engines.

### Studio

Independent SPA consuming Server API + OTel ecosystem. Two data sources:
- **Server API** (HTTP/WebSocket): configuration, self-boostrap history, Agent interaction, session management
- **OTel backends** (Jaeger/Prometheus/Grafana): observability visualization, embedded as iframe or linked views. No need to rebuild what OTel already provides.
- Fallback: Server ships an in-memory lightweight OTel collector for users without external backends.

Studio frontend stack: Vue 3 + Vite + Tailwind + Pinia + Vue Router. REST via `fetch` with composable wrappers; WebSocket via composable managing connection lifecycle (connect/reconnect/heartbeat). No TanStack Query (Vue ecosystem maturity insufficient) — simple fetch + Pinia store caching instead. Code editor: CodeMirror 6 (modular, lightweight, TS highlighting + basic completion + diff view for Level 2 editing and self_modify artifacts).

### Memory Model (Layered)

Three layers, V1 implements two:

- **Turn Context** (Turn-level): current prompt + tool results. Ephemeral, rebuilt each Turn.
- **Working Memory** (Session-level): conversation history + config state across Chains within a Session. Token-bounded; overflow handled by truncation/summarization strategy (pluggable via Interceptor at Context Assembly, default: FIFO).
- **Long-term Memory** (cross-Session): not in V1. Future plugin territory — vector stores, knowledge graphs, RAG. Context Assembly hook naturally supports injection of long-term memory fragments via Interceptor plugin.

### LLM Provider

Core defines a `LLMProvider` interface (Level 3 invariant). Vercel AI SDK provides the default implementation covering mainstream providers (OpenAI, Anthropic, Groq, Ollama, etc.). Users can swap implementations via `sdk.registerProvider()`. LLM provider registration is itself a plugin extension point.

Vercel AI SDK is an internal implementation detail of core's default `LLMProvider`. Its types (`LanguageModel`, `ToolCallPart`, etc.) must never appear in core's public exports. `ai` is a runtime dependency of core, but consumers of `@proteus/core` only see the `LLMProvider` interface contract — never the AI SDK surface.

### Tool

The sole interface between Agent Loop and the external world. Connects Action Resolution to Tool Execution.

```
interface Tool {
  definition: ToolDefinition;           // JSON Schema, provider-agnostic
  execute(params, context): Promise<ToolResult>;
}

interface ToolDefinition {
  name: string;
  description: string;
  parameters: JSONSchema;               // Provider adapters convert to native format
  builtin?: boolean;                    // true = cannot be overridden by plugins
}

interface ToolResult {
  output: unknown;                      // fed back to LLM
  artifacts?: Artifact[];               // side products (files, images), not in LLM context
  error?: { message: string; retryable: boolean };
}
```

`self_modify` is a builtin Tool conforming to this interface, with internal git commit → validate → hot-load flow. Custom tools follow the same interface; their `execute` runs at the plugin's isolation tier. TurnContext passed to execute is a restricted proxy for Tier 3 (sandboxed) tools, full access for Tier 1 (trusted).

### Project Structure

```
proteus/
├── packages/
│   ├── core/         ← Agent Loop + Hook/Plugin + OTel + self_modify
│   ├── sdk/          ← references core, exposes language API
│   ├── server/       ← references core, HTTP/WS + sessions + Studio API
│   └── studio/       ← independent SPA (Vue 3 + Vite + Tailwind)
├── docs/
│   └── adr/
├── CONTEXT.md
├── AGENTS.md
└── package.json      ← pnpm workspaces + Turborepo
```

Studio tech: Vue 3 + Vite + Tailwind. Pure client-side SPA; all data from Server API, no SSR needed.
