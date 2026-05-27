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
- **Owns**: `SessionContext` (Working Memory, SessionConfig, CostTracker), Conversations (each containing multiple Chains), Level 0-2 config, Git workspace (for self_modify artifacts)
- **Does NOT own**: `AgentContext` (shared across Sessions), Event Bus, OTel pipeline — these are shared

Multiple Sessions can share one Agent Loop runtime (especially in Server mode). self_modify changes are scoped to the Session's `HandlerRegistry` — Session A's self-modification does not affect Session B. Each Session's checkpoint data is isolated in the CheckpointStore (keyed by session_id).

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
Each Turn stage executes via an Event Bus with handler return values controlling flow. The 5-phase order is a Level 3 invariant — events are emitted in fixed sequence by the Harness core loop.

**Event emission per phase:**
```
phase:before  →  Processor (core logic)  →  phase:after
```

**Handler return values** (Go-style, no try-catch):
- `{ ok: true }` — continue to next handler
- `{ ok: true, value, transform: true }` — transform data, pass to next handler
- `{ ok: false, reason }` — block/reject (equivalent to Gate short-circuit)
- `{ abort, reason, retryFrom? }` — runtime termination
- `{ suspend, pendingInput? }` — pause for external input (human-in-the-loop)
- `{ error, recoverable? }` — error report

**Handler execution order:** Handlers are sorted by `priority` (ascending). Multiple handlers on the same event compose via sequential execution, not nesting. This replaces the onion model with a flat priority chain — semantically equivalent, simpler to implement and debug.

### Handler Registry
Handlers are registered with metadata and managed by a `HandlerRegistry`:

```typescript
interface HandlerDefinition {
  name: string;                    // unique identifier
  phases?: PhaseName[];            // scope to specific phases (all if omitted)
  events?: string[];               // scope to specific events
  priority?: number;               // lower = earlier execution, default 100
  trust: 0 | 1 | 2 | 3;           // isolation tier
  handle: HandlerFn;               // the handler function
}
```

- **Registration**: `registry.register(handler)` — adds handler, invalidates sorted cache
- **Unregistration**: `registry.unregister(name)` — removes handler
- **Replacement**: `registry.replace(name, handler)` — used by self_modify
- **Serialization**: `registry.serialize()` / `HandlerRegistry.deserialize()` — for checkpoint snapshots

Built-in handlers (priority 0-90): checkpoint (turn:end), cost tracker (llm:response), OTel bridge (phase events), freeze guard (phase:before). Self-modify can register/replace Level 1-2 handlers; Level 3 built-ins are protected.

### Event Bus (replaces EventStore)
Single event emitter serves all observation, interception, and streaming needs. Multiple consumers subscribe independently:

| Consumer | Events | Purpose |
|---|---|---|
| OTel bridge | phase:before/after, turn:start/end | Span lifecycle |
| Audit log | all events | Immutable record |
| UI streaming | phase:progress, llm:response | Real-time display |
| Handlers | phase:before | Interception (Gate equivalent) |
| Handlers | phase:after | Observation (EventStore equivalent) |

Events are also persisted to the CheckpointStore's event log for replay and debugging.

### Schema System (Zod)
Zod is the single source of truth for all runtime schemas. Zod schemas derive:
- **JSON Schema** — for LLM tool definitions (via `zod-to-json-schema`)
- **TypeScript types** — via `z.infer<typeof Schema>`
- **Runtime validation** — at trust boundaries (handler I/O, phase results, Config, SDK API inputs, self_modify generated code)

Tool parameter definitions use Zod schemas. Vercel AI SDK integration is zero-friction (it natively accepts Zod schemas).

### Three-Layer Architecture

Proteus ships as three layers:

1. **Core** — the shared runtime: Agent Loop, Hook/Plugin engine, observability pipeline, self-boostrap mechanism. A standalone library with no IO or transport concerns.
2. **SDK** — embeds Core and exposes it as a programming language API. For embedding Proteus inside another application (e.g., another AI agent). Runs a single Agent Loop instance in-process.
3. **Server** — embeds Core and wraps it with a service shell: HTTP/WebSocket API, session management, multi-tenant isolation, persistence, and Studio API. Serves multiple concurrent clients. V1: HTTP + WebSocket only; gRPC deferred to a future version.

SDK and Server share the same Core; they differ only in how they expose it (language API vs. network API) and what operational concerns they add.

**Persistence:** Core defines a `CheckpointStore` interface; Server provides the default implementation using SQLite (`better-sqlite3`). Persisted data: Session configs (Level 0), Working Memory (messages), turn-level checkpoints, event log, config snapshots (Level 1-2), cost records. `self_modify` artifacts also persist via git repo (separate mechanism). SDK mode: persistence is optional and user-configurable (in-memory by default). V2 may introduce Postgres as an alternative implementation.

### Tech Stack
Language: TypeScript / Node.js. Rationale: shared language for Core + SDK + Server + Studio frontend; AI-generated TS code is reliable; npm plugin ecosystem; IO-bound Agent Loop suits Node's event loop. Minimum Node.js version: 20 (Active LTS). TypeScript target: ES2023, module: NodeNext. Testing: Vitest (unit + integration, all packages).

### Configuration Levels

Proteus configuration spans three levels; Level 3 is an invariant:

- **Level 0 — Static Config** (JSON/YAML): LLM provider/model/temperature, tool enable/disable, log levels. Studio exposes as forms. `self_modify` cannot touch.
- **Level 1 — Declarative Orchestration** (JSON Schema / YAML pipeline): handler registration order, handler priorities, prompt templates with variable bindings. Studio visualizes and edits. `self_modify` can change.
- **Level 2 — Code-Level Config** (TypeScript functions): custom Handler logic, custom Tool implementations, custom Context Assembly strategies. Studio provides code editor. `self_modify` can generate.
- **Level 3 — Core Runtime** (invariant): Agent Loop behavior, Hook/Plugin engine mechanics. No configuration, no modification. This is Proteus's "laws of physics."

### Plugin Isolation Tiers

Handlers run at one of four isolation levels, determined by their `trust` tier:

| Tier | Name | Runtime | Node.js API | Use Case |
|------|------|---------|-------------|----------|
| 0 | Observer | Same process, read-only | Full, but read-only context | OTel collectors, loggers |
| 1 | Trusted | Same process | Full | User-authored / built-in |
| 2 | Isolated | Worker Thread | Full, crash-isolated | Community npm plugins, self_modify (V1) |
| 3 | Sandboxed | VM (isolated-vm) | Restricted (injected API only) | self_modify (V2, deferred) |

Plugin declares its trust level via manifest; user can override at registration time (upgrade or downgrade). In V1, `self_modify` plugins run at Tier 2 (Worker Thread); the non-overridable Tier 3 constraint applies from V2 onward when isolated-vm is introduced. V1 does not depend on `isolated-vm`.

**Worker Thread Communication (Tier 2):** The main thread owns all mutable state. Workers never receive the full context — they receive only the minimal parameters needed for the current handler invocation. Workers return structured deltas/patches, not mutated context objects. Handler priority chains execute on the main thread; the Worker is a middleware node that receives → transforms → returns.

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

Three-layer safety: CheckpointStore config snapshots + git repo + Watchdog process. No approval flow, no policy engine, no shadow mode (extensible later via plugins).

**CheckpointStore Config Snapshots**: before self_modify hot-loads new handlers, the current `HandlerRegistry` state is serialized and saved to `config_snapshots` table. Rollback = restore snapshot + re-register handlers. Fast, in-process recovery.

**Git Snapshots**: all self_modify artifacts (Level 1 config + Level 2 code) live in a git repo. Before hot-load, Proteus auto-commits with trace_id in the message. Rollback = `git revert`. Studio shows self-bootstrap history as git log + diff.

**Watchdog**: a separate process, fully decoupled from Agent Loop. Communicates via HTTP heartbeat — periodically calls Agent's health endpoint. If Agent is unresponsive or metrics exceed thresholds (Level 0 config), Watchdog independently executes `git revert` on the session's git repo. Watchdog only needs: git repo path + anomaly thresholds. Does not depend on Agent being alive.

**Not built yet** (future plugin extensions): approval policies, shadow Turns, automated strategy engines.

### Studio

Independent SPA consuming Server API + OTel ecosystem. Two data sources:
- **Server API** (HTTP/WebSocket): configuration, self-boostrap history, Agent interaction, session management
- **OTel backends** (Jaeger/Prometheus/Grafana): observability visualization, embedded as iframe or linked views. No need to rebuild what OTel already provides.
- Fallback: Server ships an in-memory lightweight OTel collector for users without external backends.

Studio frontend stack: Vue 3 + Vite + Tailwind + Pinia + Vue Router. REST via `fetch` with composable wrappers; WebSocket via composable managing connection lifecycle (connect/reconnect/heartbeat). No TanStack Query (Vue ecosystem maturity insufficient) — simple fetch + Pinia store caching instead. Code editor: CodeMirror 6 (modular, lightweight, TS highlighting + basic completion + diff view for Level 2 editing and self_modify artifacts).

### Memory Model (Layered)

Three layers with corresponding context regions:

**Turn Context** (Turn-level, ephemeral):
- Current prompt + tool results + prompt fragments + phase metadata
- Rebuilt each Turn from Session state
- Scoped to `TurnContext` — handlers receive it via `HandlerContext.turn`

**Working Memory** (Session-level, persisted):
- Conversation history (LLMMessage[]) + config state + cost tracker
- Token-bounded; overflow handled by truncation/summarization strategy (pluggable via handler at context_assembly, default: FIFO)
- Scoped to `SessionContext` — persisted to CheckpointStore (messages table)

**Long-term Memory** (cross-Session): not in V1. Future plugin territory — vector stores, knowledge graphs, RAG. Context Assembly handler naturally supports injection of long-term memory fragments.

### Three-Region Context

Context is organized into three nested layers with strict lifecycle boundaries:

```
AgentContext (process-level, rarely changes)
  └─ SessionContext (per-connection, persisted to SQLite)
       └─ TurnContext (per-turn, ephemeral, rebuilt each turn)
```

**AgentContext** — lives for the process lifetime. Holds `LLMProvider`, tools registry, `HandlerRegistry`, and lifecycle state machine. Handlers can read agent config; only self_modify can change it.

**SessionContext** — lives for a session (user connection). Holds `SessionConfig` (Level 0), `WorkingMemory` (message history), and `CostTracker`. Persisted to CheckpointStore. Multiple sessions share one AgentContext.

**TurnContext** — lives for a single turn, destroyed at turn:end. Holds current messages, tool results, prompt fragments, and phase metadata. References parent SessionContext and AgentContext (read-only).

Handlers receive a composite `HandlerContext { agent, session, turn }` with a `freeze()` method that returns an immutable `FrozenContext` snapshot for checkpointing.

### CheckpointStore

Durable state persistence backed by SQLite (`better-sqlite3`). Replaces the earlier MutationLog primitive.

| Table | Purpose | Granularity |
|---|---|---|
| sessions | Session metadata + config | per-session |
| messages | Working Memory (conversation history) | per-message |
| checkpoints | Turn-level snapshots | per-turn (auto at turn:end, manual on suspend) |
| event_log | Append-only event record | per-event (immutable fact stream) |
| config_snapshots | Level 1-2 handler state before self_modify | per-modification |
| cost_records | Token/cost tracking | per-LLM-call |

Key design: **snapshots + event log coexist.** Snapshots enable fast random-access restore; event log enables replay, audit, and debugging. Recovery flow: loadSession → loadMessages → loadLatestCheckpoint → rebuild Context → resume from phaseIndex.

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
│   ├── core/         ← Agent Loop + Event Bus/Handler + OTel + self_modify
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
