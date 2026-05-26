# ADR-0001: Proteus Overall Architecture

## Status

Accepted (updated — reflects Gate/Processor/Transformer/EventStore model from session 2)

## Context

We need to build an AI agent platform with these core requirements:

- Full-chain transparent observability (全链路透明可观测)
- Full-chain aspect-pluggable (全链路切面可插拔)
- Full-chain flexible extensibility (全链路灵活可扩展)
- AI self-bootstrapping — the agent can code itself at runtime (支持AI自举)
- Highly configurable (自身高度配置化)
- Agent ships as both Server and SDK, decoupled from specific clients
- Studio web frontend for direct use, configuration, and observability visualization
- Visualization supports OpenTelemetry logs, traces, metrics
- Extensibility via hook points for plugin registration

## Decisions

### 1. Execution Model: LLM Loop

The agent's core is a `while` loop. Each iteration (Turn): LLM receives context → selects tool/action → executes → result feeds back. This places LLM at the decision center, which is prerequisite for meaningful self-bootstrapping.

Alternatives considered: Workflow/DAG model (LLM only at decision nodes), Event-driven/Actor model. Rejected because self-bootstrapping is unnatural when LLM is not the central control flow.

### 2. Turn Structure: Five Stages as Hook Anchors

Each Turn has five stages, each serving as a hook anchor point:

1. **Context Assembly** — assemble prompt + history; supports dynamic prompt fragment loading (cognitive self-modification)
2. **LLM Inference** — call LLM API
3. **Action Resolution** — parse LLM output into concrete actions
4. **Tool Execution** — execute tool calls; includes `self_modify` tool (behavioral self-modification)
5. **Result Observation** — incorporate results back into context

All five stages are hook anchors. Self-bootstrapping operates through two channels: cognitive (Context Assembly) and behavioral (Tool Execution / `self_modify`).

### 3. Stage Execution Model: Gate / Processor / Transformer / EventStore

Each stage executes with three mechanisms, enforced by TypeScript types:

1. **Gate** — onion-model middleware, Readonly context + `next_handler`, can short-circuit by not calling `next_handler`. Used for cross-cutting interception (rate limiting, permission, quota, cost gating). Multiple Gates per stage, wrapping the Processor.
2. **Processor** — the stage's core business logic. Writable context, no `next_handler`, cannot short-circuit. Exactly one Processor per stage.
3. **Transformer** — sequential pipeline for pure data transformation (no before/after semantics). Used for system prompt assembly. Each Transformer receives the previous one's output.

Boundary rules (enforced by TypeScript types):
- Need to modify context → Processor
- Need to intercept/deny → Gate
- Need to transform data → Transformer
- Only need to observe → EventStore

This replaces the earlier Observer/Interceptor two-mechanism model. The split provides type-level safety for self_modify: Gates and Transformers are constrained by design, reducing the attack surface for runtime-generated code.

### 4. EventStore: Immutable Fact Broadcast + Persistence

Push-mode event system. Events are emitted after each Gate/Processor execution; subscribers receive them asynchronously. Used for observability (OTel bridge), audit logging, and UI streaming.

Events are NOT used for interception or flow control — that is Gate's responsibility. This separation ensures observability plugins cannot accidentally (or maliciously) alter execution flow.

### 5. Schema System: Zod as Single Source of Truth

Zod schemas derive:
- **JSON Schema** — for LLM tool definitions (via `zod-to-json-schema`)
- **TypeScript types** — via `z.infer<typeof Schema>`
- **Runtime validation** — at trust boundaries (Gate I/O, Processor results, Config, SDK API inputs, self_modify generated code)

Vercel AI SDK natively accepts Zod schemas — zero-friction integration. Tool parameter definitions use Zod schemas.

### 6. Three-Layer Architecture: Core / SDK / Server

1. **Core** — standalone library: Agent Loop, Gate/Processor/Transformer engine, EventStore, OTel pipeline, self-bootstrap mechanism. No IO or transport concerns.
2. **SDK** — embeds Core, exposes language API. For embedding Proteus inside another application. Single Session per process.
3. **Server** — embeds Core, wraps with HTTP/WebSocket API, session management, multi-tenant isolation, persistence, Studio API. V1: HTTP + WebSocket only; gRPC deferred to a future version.

SDK and Server share Core; they differ only in exposure (language API vs. network API) and operational concerns.

**Persistence:** Core defines a persistence interface; Server provides the default implementation using SQLite (`better-sqlite3`). Persisted data: Session configs (Level 0-2), Working Memory (conversation history). `self_modify` artifacts persist via git repo (separate mechanism). SDK mode: persistence is optional and user-configurable (in-memory by default).

### 7. Tech Stack: TypeScript / Node.js

Shared language across Core + SDK + Server + Studio frontend. AI-generated TS code is reliable for self-bootstrapping. npm plugin ecosystem. IO-bound Agent Loop suits Node's event loop.

Minimum Node.js version: 20 (Active LTS). TypeScript target: ES2023, module: NodeNext. `engines` in all package.json. Testing: Vitest (unit + integration, all packages). Monorepo: pnpm workspaces + Turborepo.

Server framework: Fastify v5 (see ADR-0002).

Studio: Vue 3 + Vite + Tailwind + Pinia + Vue Router. REST via `fetch` with composable wrappers; WebSocket via composable managing connection lifecycle. No TanStack Query. Code editor: CodeMirror 6.

### 8. Configuration Levels

| Level | Format | self_modify? | Studio UI |
|-------|--------|-------------|-----------|
| 0 — Static Config | JSON/YAML | No | Forms |
| 1 — Declarative Orchestration | JSON Schema / YAML | Yes | Visual editor |
| 2 — Code-Level Config | TypeScript | Yes | Code editor |
| 3 — Core Runtime | — (invariant) | No | — |

Level 3 (Agent Loop behavior, Gate/Processor/Transformer engine) is an invariant — Proteus's "laws of physics."

### 9. Plugin Isolation: Four Tiers

| Tier | Name | Runtime | API Access | Use Case |
|------|------|---------|------------|----------|
| 0 | Observer | Same process, read-only | Full, read-only context | OTel, logging |
| 1 | Trusted | Same process | Full | User-authored, built-in |
| 2 | Isolated | Worker Thread | Full, crash-isolated | Community npm plugins, self_modify (V1) |
| 3 | Sandboxed | VM (isolated-vm) | Restricted (injected only) | self_modify (V2, deferred) |

Plugin declares trust via manifest; user can override at registration, except `self_modify` plugins are always Tier 3 (from V2 onward). In V1, `self_modify` runs at Tier 2.

**Worker Thread Communication (Tier 2):** The main thread owns all mutable state. Workers never receive the full context — they receive only the minimal parameters needed for the current Gate/Processor invocation. Workers return structured deltas/patches, not mutated context objects. Gate `next_handler` chains execute on the main thread; the Worker is a middleware node that receives → transforms → returns.

### 10. Observability: OTel Mapping + SDK Isolation

| OTel Signal | Proteus Concept |
|---|---|
| Trace | Chain |
| Span | Turn |
| Child Span | Stage (5 per Turn) |
| Metric (Counter) | Turn count, tool calls, tokens |
| Metric (Histogram) | Turn duration, LLM latency |
| Metric (Gauge) | Active chains, context utilization |
| Log | EventStore events + custom |

Granularity stops at Stage level. Finer spans are opt-in. Exception: `self_modify` tool is auto-expanded internally (generate → validate → register → hot-load).

**OTel SDK Isolation:** `@opentelemetry/*` packages are internal implementation details of Core. Core defines its own observability interfaces (`ProteusTracer`, `ProteusSpan`, `ProteusMetric`); the OTel JS SDK provides the default implementation. Core's public exports never reference OTel types. This mirrors the `LLMProvider` pattern — pre-1.0 OTel SDK upgrades only affect the internal adapter layer.

### 11. Self-Modify Safety: Git Snapshots + Watchdog

- **Git snapshots**: self_modify artifacts live in a git repo. Auto-commit before hot-load (message contains trace_id). Rollback = `git revert`. Studio shows history as git log + diff.
- **Watchdog**: separate process, fully decoupled from Agent Loop. Communicates via HTTP heartbeat. If Agent is unresponsive or metrics exceed thresholds (Level 0 config), Watchdog independently executes `git revert`.
- Future extensions (approval policies, shadow Turns, strategy engines) will be plugins, not core features.

### 12. Studio: Independent SPA + OTel Ecosystem

- Consumes Server API (HTTP/WebSocket) for configuration, self-bootstrap history, Agent interaction.
- Leverages existing OTel backends (Jaeger/Prometheus/Grafana) for observability visualization.
- Fallback: Server ships an in-memory lightweight OTel collector for users without external backends.

### 13. Memory Model: Layered

- **Turn Context** (Turn-level): current prompt + tool results. Ephemeral.
- **Working Memory** (Session-level): conversation history + config state. Token-bounded; truncation strategy pluggable (default: FIFO).
- **Long-term Memory** (cross-Session): not in V1. Plugin territory (vector stores, RAG).

### 14. LLM Provider: Custom Interface + AI SDK Default

Core defines `LLMProvider` interface (Level 3 invariant). Vercel AI SDK provides default implementation covering mainstream providers. Users swap via `sdk.registerProvider()`.

Vercel AI SDK is an internal implementation detail of core's default `LLMProvider`. Its types (`LanguageModel`, `ToolCallPart`, etc.) must never appear in core's public exports. `ai` is a runtime dependency of core, but consumers of `@proteus/core` only see the `LLMProvider` interface contract.

### 15. Tool: Unified Interface

```ts
interface Tool {
  definition: ToolDefinition;  // JSON Schema, provider-agnostic
  execute(params, context): Promise<ToolResult>;
}
```

`self_modify` is a builtin Tool (`builtin: true`, non-overridable). TurnContext is a restricted proxy for Tier 3, full access for Tier 1.

### 16. Session: Conversation Container + Independent Config

Session is a conversation container with independent configuration. Multiple Sessions share one Agent Loop.

- Owns: Working Memory, Conversations, Level 0-2 config, Git workspace
- Does NOT own: Agent Loop, Plugin Engine, OTel pipeline (shared)

self_modify changes are scoped to the Session's git workspace.

### 17. Agent Loop Concurrency

- Per-Session: Turns are serial. Concurrent calls to the same Session are deduplicated (return same result, not re-executed).
- Cross-Session: multiple Sessions can process Turns concurrently on the same Agent Loop.
- Events routed by sessionID to prevent cross-Session pollution.

## Consequences

**Positive:**
- Self-bootstrapping is first-class with clear safety boundaries (Git + Watchdog + Level 3 invariant)
- Observability is structural, not bolted on (every stage is a hook, every hook emits events)
- Gate/Processor/Transformer split provides type-level safety for self_modify plugins
- EventStore separates observation from interception — observability plugins cannot alter flow
- Zod as single schema source eliminates type drift between runtime and compile-time
- SDK/Server split enables embedded and standalone deployment
- Session isolation prevents self_modify from affecting other users
- OTel SDK isolation protects Core's public API from upstream breaking changes

**Negative / Risks:**
- Worker Thread (Tier 2) serialization overhead for large Turn contexts (mitigated by minimal-param communication model)
- isolated-vm (Tier 3) adds complexity and may have Node version coupling (deferred to V2)
- Git-as-snapshot may not scale for high-frequency self_modify (mitigation: squashing, GC)
- Four-tier plugin isolation increases API surface to document and maintain
- Sharing Agent Loop across Sessions requires careful routing and isolation testing
