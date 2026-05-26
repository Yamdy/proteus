# ADR-0001: Proteus Overall Architecture

## Status

Accepted

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

### 3. Hook/Plugin Model: Hybrid Observer + Interceptor

Hooks support two plugin natures on the same anchor point:

- **Observer plugins**: read-only, do not alter execution flow. Used for observability (logs, traces, metrics). Broadcast-style.
- **Interceptor plugins**: can read, modify, or abort execution flow. Used for functional extension. Middleware-chain style.

Observers execute before Interceptors at each hook point.

### 4. Three-Layer Architecture: Core / SDK / Server

1. **Core** — standalone library: Agent Loop, Hook/Plugin engine, observability pipeline, self-bootstrap mechanism. No IO or transport concerns.
2. **SDK** — embeds Core, exposes language API. For embedding Proteus inside another application. Single Session per process.
3. **Server** — embeds Core, wraps with HTTP/gRPC API, WebSocket streaming, session management, multi-tenant isolation, persistence, Studio API.

SDK and Server share Core; they differ only in exposure (language API vs. network API) and operational concerns.

### 5. Tech Stack: TypeScript / Node.js

Shared language across Core + SDK + Server + Studio frontend. AI-generated TS code is reliable for self-bootstrapping. npm plugin ecosystem. IO-bound Agent Loop suits Node's event loop.

Studio: Vue 3 + Vite + Tailwind (SPA). Monorepo: pnpm workspaces + Turborepo.

### 6. Configuration Levels

| Level | Format | self_modify? | Studio UI |
|-------|--------|-------------|-----------|
| 0 — Static Config | JSON/YAML | No | Forms |
| 1 — Declarative Orchestration | JSON Schema / YAML | Yes | Visual editor |
| 2 — Code-Level Config | TypeScript | Yes | Code editor |
| 3 — Core Runtime | — (invariant) | No | — |

Level 3 (Agent Loop behavior, Hook/Plugin engine) is an invariant — Proteus's "laws of physics."

### 7. Plugin Isolation: Four Tiers

| Tier | Name | Runtime | API Access | Use Case |
|------|------|---------|------------|----------|
| 0 | Observer | Same process, read-only | Full, read-only context | OTel, logging |
| 1 | Trusted | Same process | Full | User-authored, built-in |
| 2 | Isolated | Worker Thread | Full, crash-isolated | Community npm plugins |
| 3 | Sandboxed | VM (isolated-vm) | Restricted (injected only) | self_modify generated |

Plugin declares trust via manifest; user can override at registration, except `self_modify` plugins are always Tier 3.

### 8. Observability: OTel Mapping

| OTel Signal | Proteus Concept |
|---|---|
| Trace | Chain |
| Span | Turn |
| Child Span | Stage (5 per Turn) |
| Metric (Counter) | Turn count, tool calls, tokens |
| Metric (Histogram) | Turn duration, LLM latency |
| Metric (Gauge) | Active chains, context utilization |
| Log | Hook observer events + custom |

Granularity stops at Stage level. Finer spans are opt-in. Exception: `self_modify` tool is auto-expanded internally.

### 9. Self-Modify Safety: Git Snapshots + Watchdog

- **Git snapshots**: self_modify artifacts live in a git repo. Auto-commit before hot-load (message contains trace_id). Rollback = `git revert`. Studio shows history as git log + diff.
- **Watchdog**: separate process, subscribes to OTel metrics. Detects anomalies → signals Agent to `git revert`.
- Future extensions (approval policies, shadow Turns, strategy engines) will be plugins, not core features.

### 10. Studio: Independent SPA + OTel Ecosystem

- Consumes Server API (HTTP/WebSocket) for configuration, self-bootstrap history, Agent interaction.
- Leverages existing OTel backends (Jaeger/Prometheus/Grafana) for observability visualization.
- Fallback: Server ships an in-memory lightweight OTel collector for users without external backends.

### 11. Memory Model: Layered

- **Turn Context** (Turn-level): current prompt + tool results. Ephemeral.
- **Working Memory** (Session-level): conversation history + config state. Token-bounded; truncation strategy pluggable (default: FIFO).
- **Long-term Memory** (cross-Session): not in V1. Plugin territory (vector stores, RAG).

### 12. LLM Provider: Custom Interface + AI SDK Default

Core defines `LLMProvider` interface (Level 3 invariant). Vercel AI SDK provides default implementation. Users swap via `sdk.registerProvider()`.

### 13. Tool: Unified Interface

```ts
interface Tool {
  definition: ToolDefinition;  // JSON Schema, provider-agnostic
  execute(params, context): Promise<ToolResult>;
}
```

`self_modify` is a builtin Tool (`builtin: true`, non-overridable). TurnContext is a restricted proxy for Tier 3, full access for Tier 1.

### 14. Session: Conversation Container + Independent Config

Session is a conversation container with independent configuration. Multiple Sessions share one Agent Loop.

- Owns: Working Memory, Conversations, Level 0-2 config, Git workspace
- Does NOT own: Agent Loop, Plugin Engine, OTel pipeline (shared)

self_modify changes are scoped to the Session's git workspace.

### 15. Agent Loop Concurrency

- Per-Session: Turns are serial. Concurrent calls to the same Session are deduplicated (return same result, not re-executed).
- Cross-Session: multiple Sessions can process Turns concurrently on the same Agent Loop.
- Events routed by sessionID to prevent cross-Session pollution.

## Consequences

**Positive:**
- Self-bootstrapping is first-class with clear safety boundaries (Git + Watchdog + Level 3 invariant)
- Observability is structural, not bolted on (every stage is a hook, every hook emits OTel)
- Plugin system covers both passive observation and active modification
- SDK/Server split enables embedded and standalone deployment
- Session isolation prevents self_modify from affecting other users

**Negative / Risks:**
- isolated-vm (Tier 3 sandbox) adds complexity and may have Node version coupling
- Worker Thread (Tier 2) serialization overhead for large Turn contexts
- Git-as-snapshot may not scale for high-frequency self_modify (mitigation: squashing, GC)
- Four-tier plugin isolation increases API surface to document and maintain
- Sharing Agent Loop across Sessions requires careful routing and isolation testing
