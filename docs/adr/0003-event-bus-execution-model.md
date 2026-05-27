# ADR-0003: Event Bus Execution Model, Three-Region Context, and CheckpointStore

## Status

Superseded in part — Decision 1 (Event Bus + HandlerRegistry) was further consolidated into `HandlerEngine` (see issues #12, #13). The EventBus and HandlerRegistry modules were merged into a single class with observer/interceptor semantics. ADR-0003 Decisions 2-6 remain valid.

## Context

ADR-0001 defined the execution model as Gate / Processor / Transformer / EventStore — four distinct mechanisms per stage. During design deep-dives (sessions 3-4), we evaluated whether this model satisfies Proteus's seven core requirements:

1. 全链路透明可观测 — Full-chain transparent observability
2. 切面可扩展 — Cross-cutting aspects extensible
3. 阶段可插拔 — Stages pluggable
4. 符合 Harness — Harness pattern (not agent framework)
5. 过程可中断可重放 — Interruptible and replayable
6. AI 自举 — Self-bootstrapping
7. 长时间任务 — Long-running tasks

We also evaluated the `Signal<TurnContext> + MutationLog + AsyncGenerator` model (session 3). While elegant, the Generator model has a structural weakness for long-running tasks: generator suspend state is memory-resident and fragile across process restarts. Serialization of generator frames is technically possible but brittle.

We studied [pi coding agent](https://github.com/earendil-works/pi)'s extension architecture. Pi achieves equivalent functionality with a single pattern: event bus + handler return values. No generators, no reactive state wrappers, no mutation logs. This demonstrated that the four-mechanism model can be collapsed without losing expressiveness.

## Decisions

### 1. Replace Gate/Processor/Transformer/EventStore with Event Bus

Each stage's execution is driven by an event emitter. Handlers subscribe to events and return structured results to control flow.

```
emitter.on("phase:context_assembly", handler)
emitter.on("phase:llm_inference", handler)
emitter.on("phase:action_resolution", handler)
emitter.on("phase:tool_execution", handler)
emitter.on("phase:result_observation", handler)
```

**Handler return values control flow** (Go-style, no try-catch):

```typescript
type HandlerResult =
  | { ok: true; value?: unknown }         // continue, optionally transform
  | { ok: false; reason: string }         // reject/block
  | { abort: boolean; reason: string }    // runtime termination
  | { suspend: boolean; pendingInput?: unknown }  // pause for external input
  | { error: Error; recoverable?: boolean }       // error report
```

**Mapping from ADR-0001 mechanisms:**

| ADR-0001 | Event Bus Equivalent |
|---|---|
| Gate (onion middleware, can short-circuit) | Handler returns `{ ok: false, reason }` |
| Processor (core logic, writable context) | Phase handler body |
| Transformer (sequential data pipeline) | Handler returns `{ ok: true, value: transformed }` |
| EventStore (immutable broadcast) | Multiple handlers on same event (pub/sub) |
| Streaming (not modeled) | `emitter.on("phase:progress", ...)` |

The 5-phase order is preserved — it is Level 3 invariant. Events are emitted in fixed sequence by the Harness core loop.

This **supersedes ADR-0001 Decision 3** (Stage Execution Model). ADR-0001 Decisions 1 (LLM Loop), 2 (Five Stages), 5 (Zod), 6-17 remain valid.

### 2. Three-Region Context

Context is organized into three layers with strict nesting and lifecycle:

```
AgentContext (process-level, rarely changes)
  └─ SessionContext (per-connection, persisted)
       └─ TurnContext (per-turn, ephemeral)
```

**AgentContext** — process lifetime:

```typescript
interface AgentContext {
  readonly provider: LLMProvider;
  readonly tools: Map<string, Tool>;
  readonly handlers: HandlerEngine;         // Level 1-2, self-modify can change
  readonly lifecycle: LifecycleStateMachine;
}
```

**SessionContext** — session lifetime, persisted to SQLite:

```typescript
interface SessionContext {
  readonly sessionId: string;
  readonly config: SessionConfig;           // Level 0
  readonly memory: WorkingMemory;           // message history, token-bounded
  readonly cost: CostTracker;
}
```

**TurnContext** — turn lifetime, ephemeral, rebuilt each turn:

```typescript
interface TurnContext {
  readonly turnId: string;
  readonly chainId: string;
  readonly phaseIndex: number;
  readonly phaseName: PhaseName;
  messages: LLMMessage[];
  toolResults: ToolResult[];
  promptFragments: PromptFragment[];
  metadata: Map<string, unknown>;
  readonly session: SessionContext;
  readonly agent: AgentContext;
}
```

Handlers receive a composite context:

```typescript
interface HandlerContext {
  agent: AgentContext;
  session: SessionContext;
  turn: TurnContext;
  freeze(): FrozenContext;  // returns immutable snapshot for checkpointing
}
```

This supersedes the `Signal<TurnContext>` primitive — TurnContext is plain data, not wrapped in reactive state. The event bus replaces Signal's subscriber mechanism for observation.

### 3. CheckpointStore for Interrupt/Replay and Long-Running Tasks

All durable state goes through a CheckpointStore backed by SQLite (`better-sqlite3`):

- **Sessions** — session metadata + config
- **Messages** — Working Memory (conversation history)
- **Checkpoints** — turn-level snapshots, created at turn:end and on suspend
- **Event Log** — append-only record of all events (immutable fact stream)
- **Config Snapshots** — Level 1-2 handler state before self_modify
- **Cost Records** — incremental token/cost tracking

Key design decisions:

**Store snapshots AND event log.** Snapshots enable fast random-access restore; event log enables replay and audit. This is not redundant — snapshots are for recovery speed, logs are for correctness and debugging.

**Turn-level granularity.** Checkpoints are saved at turn boundaries (turn:end), not after every phase. This balances storage cost vs. recovery precision. Suspending mid-turn saves an additional checkpoint with `resumeReason: "suspend"` and `pendingInput` metadata.

**Handlers are not serialized.** Level 1-2 handler declarations (source code + metadata) are stored in `config_snapshots`, but handler functions are rebuilt from source at startup. This avoids serializing closures and ensures self_modify changes are replayable.

**Recovery flow:**

```
1. loadSession(sessionId) → SessionMeta
2. loadMessages(sessionId) → LLMMessage[]
3. loadLatestCheckpoint(sessionId) → Checkpoint
4. Rebuild AgentContext from config
5. Rebuild SessionContext from snapshot
6. Deserialize TurnContext from checkpoint
7. If resumeReason === "suspend": wait for external input
8. Resume from checkpoint.phaseIndex + 1
```

### 4. Context Freezing for Checkpoint Integrity

`HandlerContext.freeze()` returns a `FrozenContext` — a deep-readonly snapshot with timestamp and checksum. This is the unit of checkpointing. FrozenContext is serializable (JSON-safe), while live HandlerContext is not (contains function references).

```typescript
interface FrozenContext {
  readonly turn: Readonly<SerializedTurnContext>;
  readonly sessionSnapshot: {
    messages: readonly LLMMessage[];
    cost: CostSnapshot;
    config: Readonly<SessionConfig>;
  };
  readonly timestamp: number;
  readonly checksum: string;
}
```

### 5. Lifecycle State Machine at Chain Level

State transitions are managed by a lifecycle state machine, scoped to Chain:

```
pending → running → completed
                  → paused (suspend)
                  → errored (recoverable)
                  → cancelled (user abort)
```

Phases are NOT states — they are execution steps within the `running` state. This is unchanged from ADR-0001 / session 3 decisions.

### 6. OTel Integration via Event Bus

Events are natural span boundaries. The OTel bridge subscribes to events and creates/ends spans:

```
emitter.on("chain:start")     → tracer.startSpan("chain")
emitter.on("turn:start")      → tracer.startSpan("turn", parent=chain)
emitter.on("phase:before")    → tracer.startSpan("phase", parent=turn)
emitter.on("phase:after")     → span.end()
emitter.on("turn:end")        → turnSpan.end()
emitter.on("chain:end")       → chainSpan.end()
```

Multiple consumers (OTel, UI streaming, audit log) subscribe independently — no bridging layer needed. This is an improvement over the Generator model where yield is single-consumer.

## Consequences

**Positive:**
- Single abstraction (event bus) replaces four mechanisms — lower conceptual cost
- Handler return values provide the same flow control as Gate short-circuit, with simpler API
- Event bus is naturally multi-consumer — OTel, UI, audit subscribe independently
- CheckpointStore with snapshots + event log is more robust for long-running tasks than generator serialization
- Three-region context provides clear scope boundaries for handlers and persistence
- Pi agent validates this pattern in production at scale

**Negative / Risks:**
- Losing generator's syntactic elegance for suspend/resume (replaced by explicit checkpoint + re-emit)
- Handler ordering must be managed carefully — multiple handlers on same event need deterministic execution order
- Onion model (middleware wrapping) must be explicitly implemented via handler chain, not implicit via generator nesting
- Event log storage grows unbounded without pruning strategy

**Supersedes:**
- ADR-0001 Decision 3 (Gate/Processor/Transformer/EventStore) — replaced by Event Bus
- Session 3 `Signal<TurnContext>` primitive — TurnContext is plain data
- Session 3 `MutationLog` primitive — replaced by Event Log + Config Snapshots in CheckpointStore
- Session 3 `AsyncGenerator` primitive — replaced by event handlers + return values
