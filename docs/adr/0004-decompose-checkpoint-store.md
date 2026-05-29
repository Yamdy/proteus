# ADR-0004: Decompose CheckpointStore into Narrow Interfaces

## Status

Accepted

## Context

`CheckpointStore` is a single interface with 15 methods spanning 6 concerns: sessions, messages, checkpoints, event log, config snapshots, and cost records. Every consumer — `Harness`, `SessionManager`, `ConfigSnapshotManager`, `ChatServer` — receives the full 15-method interface even though each uses only 1-2 concerns.

This creates three problems:

1. **Shallow module** — the interface is nearly as complex as the implementation. Consumers couple to concerns they don't use.
2. **Type-unsafe workaround** — `SessionManager.destroy()` uses `{ destroyed: true } as any` because `SessionMeta` has no `destroyed` field and `CheckpointStore` has no `deleteSession` method.
3. **Test surface bloat** — mocking `CheckpointStore` for a test that only needs checkpoints requires implementing all 15 methods.

Additionally, `InMemoryCheckpointStore` and `SqliteCheckpointStore` are monolithic classes that implement all 15 methods. The SQLite implementation shares a single `db` instance and a single `migrate()` method across all 6 concerns.

## Decision

### 1. Split into 6 narrow interfaces by concern

```typescript
interface SessionStore {
  createSession(meta: SessionMeta): void;
  loadSession(sessionId: string): SessionMeta | undefined;
  updateSession(sessionId: string, patch: Partial<SessionMeta>): void;
  deleteSession(sessionId: string): void;
  listSessions(): SessionMeta[];
}

interface MessageStore {
  addMessages(sessionId: string, messages: LLMMessage[]): void;
  loadMessages(sessionId: string): LLMMessage[];
}

interface CheckpointLog {
  saveCheckpoint(checkpoint: FrozenContext): void;
  loadLatestCheckpoint(sessionId: string): FrozenContext | undefined;
  loadCheckpoint(sessionId: string, turnId: string): FrozenContext | undefined;
}

interface EventLog {
  appendEvent(event: StoreEvent): void;
  queryEvents(sessionId: string, since?: number): StoreEvent[];
}

interface ConfigStore {
  saveConfigSnapshot(snapshot: ConfigSnapshot): void;
  loadLatestConfigSnapshot(sessionId: string): ConfigSnapshot | undefined;
  listConfigSnapshots(sessionId: string): ConfigSnapshot[];
}

interface CostStore {
  addCostRecord(record: CostRecord): void;
  loadCostRecords(sessionId: string): CostRecord[];
}
```

A composed type preserves backward compatibility for consumers that need the full surface:

```typescript
type CheckpointStore = SessionStore & MessageStore & CheckpointLog & EventLog & ConfigStore & CostStore;
```

### 2. Add `deleteSession` to `SessionStore`

Replaces the `{ destroyed: true } as any` hack in `SessionManager.destroy()`. The `SessionMeta` type does not gain a `destroyed` field — deletion is a first-class operation on the store, not a metadata flag.

### 3. Split implementations — one class per concern

Each narrow interface gets its own implementation class. For in-memory:

```
InMemorySessionStore implements SessionStore
InMemoryMessageStore implements MessageStore
InMemoryCheckpointLog implements CheckpointLog
InMemoryEventLog implements EventLog
InMemoryConfigStore implements ConfigStore
InMemoryCostStore implements CostStore
```

A factory function composes them:

```typescript
function createInMemoryStore(): CheckpointStore {
  return Object.assign({},
    new InMemorySessionStore(),
    new InMemoryMessageStore(),
    new InMemoryCheckpointLog(),
    new InMemoryEventLog(),
    new InMemoryConfigStore(),
    new InMemoryCostStore(),
  );
}
```

For SQLite, the factory handles all migrations before distributing the shared `db`:

```typescript
function createSqliteStore(dbPath: string): CheckpointStore {
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  // All CREATE TABLE + ALTER TABLE migrations happen here
  migrate(db);
  return Object.assign({},
    new SqliteSessionStore(db),
    new SqliteMessageStore(db),
    new SqliteCheckpointLog(db),
    new SqliteEventLog(db),
    new SqliteConfigStore(db),
    new SqliteCostStore(db),
  );
}
```

### 4. Narrow consumer dependencies

Each consumer declares only the concern it uses:

| Consumer | Before | After |
|----------|--------|-------|
| `Harness` | `store: CheckpointStore` | `store: CheckpointLog` |
| `SessionManager` | `store: CheckpointStore` | `store: SessionStore` |
| `ConfigSnapshotManager` | `store: CheckpointStore` | `store: ConfigStore` |
| `ChatServer` | `store: CheckpointStore` | `store: CheckpointStore` (unchanged — passes to sub-modules) |

### 5. Delete the `InMemoryCheckpointStore` class name

All consumers use the factory function or the composed `CheckpointStore` type. The class name is removed entirely — one-shot migration, no alias.

### 6. Separate test files per concern

Each narrow interface gets its own test file. The existing monolithic test files (`checkpoint-store.test.ts`, `sqlite-checkpoint-store.test.ts`) are split into 6 files each.

## Consequences

**Positive:**
- Each consumer depends only on the concern it uses — leverage at the interface
- `SessionManager.destroy()` uses `deleteSession()` — no `as any` hack
- Tests mock only the 2-3 methods they need, not 15
- Each store class has one concern — locality for bugs and changes
- Factory pattern keeps SQLite migration deterministic (single entry point)
- `Object.assign` composition is zero-cost at runtime

**Negative / Risks:**
- One-shot migration touches 15+ test files and 5 production files — large diff
- `Object.assign` composition means `CheckpointStore` is a structural type, not a nominal one — no `instanceof` checks
- SQLite store classes receive a raw `db` instance — no encapsulation of which tables each class owns (trust-based, not enforced)
- 6 test files × 2 implementations = 12 test files to maintain (up from 2)

**Supersedes:**
- The `SessionManager.destroy()` type hack (`{ destroyed: true } as any`) — replaced by `deleteSession()`
