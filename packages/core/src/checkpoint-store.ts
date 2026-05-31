import type { SessionConfig, LLMMessage } from "./types.js";
import type { FrozenContext } from "./context.js";

// --- Data types for each store ---

export interface SessionMeta {
  sessionId: string;
  config: SessionConfig;
  createdAt?: number;
  updatedAt?: number;
}

export interface StoreEvent {
  sessionId: string;
  event: string;
  payload?: unknown;
  timestamp: number;
}

export interface ConfigSnapshot {
  sessionId: string;
  handlers: unknown;
  timestamp: number;
  description?: string;
  checksum?: string;
}

export interface CostRecord {
  sessionId: string;
  turnId: string;
  promptTokens: number;
  completionTokens: number;
  timestamp: number;
}

// --- Narrow interfaces (one per concern) ---

export interface SessionStore {
  createSession(meta: SessionMeta): void;
  loadSession(sessionId: string): SessionMeta | undefined;
  updateSession(sessionId: string, patch: Partial<SessionMeta>): void;
  deleteSession(sessionId: string): void;
  listSessions(): SessionMeta[];
}

export interface MessageStore {
  addMessages(sessionId: string, messages: LLMMessage[]): void;
  loadMessages(sessionId: string): LLMMessage[];
}

export interface CheckpointLog {
  saveCheckpoint(checkpoint: FrozenContext): void;
  loadLatestCheckpoint(sessionId: string): FrozenContext | undefined;
  loadCheckpoint(sessionId: string, turnId: string): FrozenContext | undefined;
}

export interface EventLog {
  appendEvent(event: StoreEvent): void;
  queryEvents(sessionId: string, since?: number): StoreEvent[];
}

export interface ConfigStore {
  saveConfigSnapshot(snapshot: ConfigSnapshot): void;
  loadLatestConfigSnapshot(sessionId: string): ConfigSnapshot | undefined;
  listConfigSnapshots(sessionId: string): ConfigSnapshot[];
}

export interface CostStore {
  addCostRecord(record: CostRecord): void;
  loadCostRecords(sessionId: string): CostRecord[];
}

// --- Composed type for consumers that need the full surface ---

export type CheckpointStore = SessionStore & MessageStore & CheckpointLog & EventLog & ConfigStore & CostStore;

// --- In-memory implementations (one per concern) ---

export class InMemorySessionStore implements SessionStore {
  private sessions = new Map<string, SessionMeta>();

  createSession(meta: SessionMeta): void {
    this.sessions.set(meta.sessionId, { ...meta, createdAt: meta.createdAt ?? Date.now(), updatedAt: meta.updatedAt ?? Date.now() });
  }

  loadSession(sessionId: string): SessionMeta | undefined {
    return this.sessions.get(sessionId);
  }

  updateSession(sessionId: string, patch: Partial<SessionMeta>): void {
    const existing = this.sessions.get(sessionId);
    if (!existing) return;
    this.sessions.set(sessionId, { ...existing, ...patch, updatedAt: Date.now() });
  }

  deleteSession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  listSessions(): SessionMeta[] {
    return [...this.sessions.values()];
  }
}

export class InMemoryMessageStore implements MessageStore {
  private messages = new Map<string, LLMMessage[]>();

  addMessages(sessionId: string, messages: LLMMessage[]): void {
    const existing = this.messages.get(sessionId) ?? [];
    existing.push(...messages);
    this.messages.set(sessionId, existing);
  }

  loadMessages(sessionId: string): LLMMessage[] {
    return [...(this.messages.get(sessionId) ?? [])];
  }
}

export class InMemoryCheckpointLog implements CheckpointLog {
  private checkpoints = new Map<string, FrozenContext[]>();

  saveCheckpoint(checkpoint: FrozenContext): void {
    const existing = this.checkpoints.get(checkpoint.sessionId) ?? [];
    existing.push(checkpoint);
    this.checkpoints.set(checkpoint.sessionId, existing);
  }

  loadLatestCheckpoint(sessionId: string): FrozenContext | undefined {
    const arr = this.checkpoints.get(sessionId);
    if (!arr || arr.length === 0) return undefined;
    return arr[arr.length - 1];
  }

  loadCheckpoint(sessionId: string, turnId: string): FrozenContext | undefined {
    const arr = this.checkpoints.get(sessionId);
    return arr?.find((c) => c.turnId === turnId);
  }
}

export class InMemoryEventLog implements EventLog {
  private events: StoreEvent[] = [];

  appendEvent(event: StoreEvent): void {
    this.events.push(event);
  }

  queryEvents(sessionId: string, since?: number): StoreEvent[] {
    return this.events.filter(
      (e) => e.sessionId === sessionId && (since === undefined || e.timestamp >= since),
    );
  }
}

export class InMemoryConfigStore implements ConfigStore {
  private configSnapshots = new Map<string, ConfigSnapshot[]>();

  saveConfigSnapshot(snapshot: ConfigSnapshot): void {
    const existing = this.configSnapshots.get(snapshot.sessionId) ?? [];
    existing.push(snapshot);
    this.configSnapshots.set(snapshot.sessionId, existing);
  }

  loadLatestConfigSnapshot(sessionId: string): ConfigSnapshot | undefined {
    const arr = this.configSnapshots.get(sessionId);
    if (!arr || arr.length === 0) return undefined;
    return arr[arr.length - 1];
  }

  listConfigSnapshots(sessionId: string): ConfigSnapshot[] {
    return [...(this.configSnapshots.get(sessionId) ?? [])];
  }
}

export class InMemoryCostStore implements CostStore {
  private costRecords = new Map<string, CostRecord[]>();

  addCostRecord(record: CostRecord): void {
    const existing = this.costRecords.get(record.sessionId) ?? [];
    existing.push(record);
    this.costRecords.set(record.sessionId, existing);
  }

  loadCostRecords(sessionId: string): CostRecord[] {
    return [...(this.costRecords.get(sessionId) ?? [])];
  }
}

// --- Factory: compose all in-memory stores into a CheckpointStore ---

function bindMethods(instance: object): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of Object.getOwnPropertyNames(Object.getPrototypeOf(instance))) {
    if (key === "constructor") continue;
    const value = (instance as Record<string, unknown>)[key];
    if (typeof value === "function") {
      result[key] = value.bind(instance);
    }
  }
  return result;
}

export function createInMemoryStore(): CheckpointStore {
  const session = new InMemorySessionStore();
  const message = new InMemoryMessageStore();
  const checkpoint = new InMemoryCheckpointLog();
  const event = new InMemoryEventLog();
  const config = new InMemoryConfigStore();
  const cost = new InMemoryCostStore();

  return Object.assign(
    {},
    bindMethods(session),
    bindMethods(message),
    bindMethods(checkpoint),
    bindMethods(event),
    bindMethods(config),
    bindMethods(cost),
  ) as CheckpointStore;
}
