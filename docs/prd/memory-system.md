# PRD: Proteus Memory System

## Problem Statement

Proteus agents have no long-term memory. The current `WorkingMemory` class is a plain message array with a naive `truncate(maxTokens)` that slices by message count, not token count. Agents cannot recall information from past conversations, cannot maintain structured state across turns, and have no way to semantically search prior interactions. This makes Proteus unsuitable for any multi-session or multi-turn production use case where context continuity matters.

Compared to Mastra (which scores 9/10 on memory), Proteus scores 2/10. The gap is the single largest deficiency identified in the competitive analysis (`docs/analysis/proteus-vs-mastra.md`).

## Solution

Replace the current `WorkingMemory` (plain message array) with a layered memory system that gives agents four capabilities:

1. **Conversation History** — managed message storage with pluggable truncation strategies (FIFO, sliding-window, token-budget)
2. **Semantic Recall** — vector-embedding-based search over past messages, enabling agents to retrieve relevant context from distant history
3. **Structured Working Memory** — template-driven key-value store that persists agent state (user preferences, task progress, etc.) across turns and sessions
4. **Memory Tools** — `recall` and `store_memory` tools that agents can invoke during tool_execution to query and persist long-term memories

The old `WorkingMemory` class and the `workingMemory` field on `SessionContext` are deleted. Memory is always-on — there is no opt-in flag. The design follows Proteus conventions: Zod schemas as single source of truth, narrow storage interfaces, handler-compatible integration, and no coupling to specific embedding providers.

## User Stories

1. As a developer, I want to configure a memory provider when creating a session, so that the agent can remember information across turns
2. As a developer, I want conversation history to be automatically persisted to SQLite, so that agents survive process restarts
3. As a developer, I want a FIFO truncation strategy that respects token budgets, so that context windows are not exceeded
4. As a developer, I want a sliding-window truncation strategy that keeps the first system message and the most recent N messages, so that system prompts are preserved
5. As a developer, I want a smart truncation strategy that summarizes older messages, so that no context is lost
6. As a developer, I want to store vector embeddings alongside messages, so that semantic search is possible
7. As a developer, I want to query past messages by semantic similarity, so that agents can recall relevant information from distant history
8. As a developer, I want to configure a custom embedding function, so that I can use any embedding model
9. As a developer, I want structured working memory with a JSON template, so that agents maintain structured state across turns
10. As a developer, I want working memory to be injected into the system prompt automatically, so that agents have access to their state
11. As a developer, I want working memory to support partial updates (merge), so that agents can update individual fields without overwriting the entire state
12. As a developer, I want a `recall` tool that agents can call during tool execution, so that they can search long-term memory
13. As a developer, I want a `store_memory` tool that agents can call during tool execution, so that they can persist important information
14. As a developer, I want thread management that is decoupled from sessions, so that multiple conversation threads can exist within a single session
15. As a developer, I want to clone a thread with its full history and working memory, so that conversation branches are possible
16. As a developer, I want memory operations to emit events on the HandlerEngine, so that memory access is observable
17. As a developer, I want memory configuration to be part of SessionConfig, so that memory behavior is declarative
18. As a developer, I want an in-memory provider for testing, so that tests do not require SQLite
19. As a developer, I want a SQLite provider for production, so that memory persists across restarts
20. As a developer, I want the ContextAssemblyProcessor to automatically load conversation history and working memory into the prompt, so that I do not need to manage context manually
21. As a developer, I want memory to integrate with the existing CheckpointStore, so that frozen contexts include memory state
22. As a developer, I want token counting to use the session's LLMProvider.countTokens, so that truncation is accurate
23. As a developer, I want memory to support the existing ThreadStore interface, so that the migration path is smooth
24. As a developer, I want Zod schemas for all memory types, so that runtime validation is consistent with the rest of Proteus
25. As a developer, I want memory events (query, store, truncate) to be emitted as HandlerEngine events, so that they appear in OTel traces
26. As a developer, I want memory configuration to be declarative in SessionConfig, so that I can configure memory per-session
27. As a developer, I want the memory system to be extensible via handlers, so that custom memory behaviors can be added

## Implementation Decisions

### Module Breakdown

The implementation introduces one new package (`packages/memory`) and modifies two existing modules (`packages/core/src/memory/`, `packages/core/src/context.ts`).

**Deleted:**

- `WorkingMemory` class in `context.ts` — replaced entirely by the new memory system

**New deep modules (testable in isolation):**

1. **`MemoryProvider` interface** — the single abstraction for all memory operations. Every other module depends on this interface, never on concrete implementations. This is the deepest module; it encapsulates all storage concerns behind a stable API.

2. **`ConversationHistory`** — manages message retrieval and truncation. Accepts a `MemoryProvider` and a truncation strategy. Returns `LLMMessage[]` ready for prompt injection. Pure logic, no I/O beyond the provider.

3. **`SemanticRecall`** — wraps a `MemoryProvider` and an optional embedding function. Provides `search(query, topK)` and `store(entry)`. The embedding function is injected, not coupled to any specific model.

4. **`StructuredWorkingMemory`** — template-driven key-value store. Accepts a `MemoryProvider` and a template string. Provides `get()`, `update()`, `merge()`, `getFormatted()`. The template uses `{{key}}` placeholders.

5. **`MemoryTools`** — `RecallTool` and `StoreMemoryTool`. Each implements the existing `Tool` interface. They accept a `MemoryProvider` and are registered like any other tool.

**Modified modules:**

6. **`SessionContext`** — replace `workingMemory: WorkingMemory` with `memory: MemoryProvider`, `history: ConversationHistory`, `structuredMemory: StructuredWorkingMemory`. All required, no fallback.

7. **`ContextAssemblyProcessor`** — replace old working-memory logic. Prompt assembly always loads from `ConversationHistory` + `StructuredWorkingMemory`.

8. **`SessionConfig` (Zod schema)** — add required `memory: MemoryConfig` field.

### Interface Shapes

The `MemoryProvider` interface is the architectural keystone. It consolidates what Mastra splits across `MemoryStorage`, `MastraMemory`, and thread operations into a single flat interface. This follows Proteus's preference for narrow, composable interfaces over deep inheritance hierarchies.

Key decision: the provider owns both conversation storage and semantic search. This avoids the need for a separate "vector store" abstraction at this stage. Vector-specific providers (Pinecone, Qdrant) can be added later by implementing `MemoryProvider` with a different backend.

### Storage Strategy

Two storage backends:

- **`InMemoryProvider`** — for tests and SDK mode. All data in Maps. No persistence.
- **`SqliteProvider`** — for server mode. Uses `better-sqlite3` (already a dependency). Tables: `memory_entries`, `working_memory`, `threads`.

The SQLite schema extends the existing `CheckpointStore` tables rather than creating a parallel schema. This keeps the data model coherent.

### Truncation Strategy

Three strategies, selectable per-session:

- **FIFO** — keep the most recent N messages that fit within the token budget. Oldest messages are dropped first.
- **Sliding Window** — keep the first system message(s) + the most recent N messages. Preserves system prompt.
- **Smart** — summarize older messages into a condensed summary, then keep the summary + recent messages. Requires an LLM call.

FIFO and Sliding Window are pure functions (no I/O). Smart requires an LLM provider. The strategy is pluggable via a `TruncationStrategy` interface.

### Event Integration

Memory operations emit events on the HandlerEngine:

- `memory:history-loaded` — when conversation history is loaded for context assembly
- `memory:semantic-query` — when semantic search is performed
- `memory:working-memory-updated` — when working memory is modified
- `memory:tool-recall` — when the recall tool is invoked
- `memory:tool-store` — when the store_memory tool is invoked

These events follow the existing EventBus pattern and integrate with the OTel bridge.

### Configuration Shape

```typescript
// Zod schema (added to schemas/session.ts)
const MemoryConfigSchema = z.object({
  provider: z.enum(["memory", "sqlite"]).default("memory"),
  history: z.object({
    maxMessages: z.number().default(100),
    maxTokens: z.number().default(4000),
    strategy: z.enum(["fifo", "sliding-window", "smart"]).default("fifo"),
  }).optional(),
  semanticRecall: z.object({
    enabled: z.boolean().default(false),
    topK: z.number().default(5),
    threshold: z.number().default(0.7),
  }).optional(),
  workingMemory: z.object({
    template: z.string().optional(),
    maxTokens: z.number().default(2000),
  }).optional(),
});
```

## Testing Decisions

A good test exercises external behavior through the public API, not internal implementation details. For the memory system, this means:

- **MemoryProvider implementations** are tested against a shared conformance test suite. Any provider (in-memory, SQLite) must pass the same contract tests. This is the pattern used by the existing `CheckpointStore` tests.

- **ConversationHistory** is tested by verifying that `getContextMessages()` returns the correct messages for each truncation strategy, given a known set of stored messages. No mocking of the provider — use `InMemoryProvider`.

- **SemanticRecall** is tested by storing entries with known embeddings (synthetic vectors), then verifying that `search()` returns results sorted by cosine similarity. The embedding function is injected as a simple deterministic function for tests.

- **StructuredWorkingMemory** is tested by verifying template rendering, partial merge, and empty-state behavior.

- **MemoryTools** are tested by verifying that `execute()` returns the expected `ToolResult` given a known provider state. This follows the existing `ToolRegistry` test patterns.

- **ContextAssemblyProcessor integration** is tested by verifying that the assembled messages include history and working memory when a provider is configured.

- **Event emission** is tested by registering an observer on the HandlerEngine and verifying that memory events are emitted with the correct payloads.

Prior art in the codebase: `packages/core/src/__tests__/thread-store.test.ts`, `packages/core/src/checkpoint-store.test.ts`, `packages/core/src/tool-registry.test.ts`.

## Out of Scope

- **Multi-modal memory** (images, audio) — only text messages are supported in V1
- **Distributed vector stores** (Pinecone, Qdrant, Weaviate) — only in-memory and SQLite embeddings
- **Automatic summarization** (the "smart" truncation strategy) — deferred to a follow-up; FIFO and sliding-window are sufficient for V1
- **Memory sharing across agents** — each agent has its own memory namespace
- **Memory compression** — messages are stored as-is; no delta encoding
- **Memory expiration/TTL** — messages persist indefinitely; manual cleanup via `clearHistory()`
- **Cross-session memory consolidation** — each session has isolated memory
- **Memory governance** (who can read/write memory) — deferred; memory inherits session-level access control

## Further Notes

This PRD directly addresses the largest gap identified in the Proteus vs Mastra competitive analysis (`docs/analysis/proteus-vs-mastra.md`). The expected score improvement is from 2/10 to 7/10 on the memory dimension, narrowing the overall gap from -30 to approximately -15 points.

The implementation should be done in three phases:
1. Core interfaces + InMemoryProvider + ConversationHistory + StructuredWorkingMemory (1-2 weeks)
2. SqliteProvider + SemanticRecall + MemoryTools (2-3 weeks)
3. Integration with ContextAssemblyProcessor + events + documentation (1 week)

`MemoryProvider` is defined in `packages/core/src/memory/` as the interface. Concrete implementations (`InMemoryProvider`, `SqliteProvider`) and `MemoryTools` live in `packages/memory/`. The old `WorkingMemory` class in `context.ts` is deleted.
