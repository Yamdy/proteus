import type { SessionConfig, LLMMessage, FrozenContext } from "./index.js";

// --- Data types for each store ---

export interface SessionMeta {
  sessionId: string;
  config: SessionConfig;
  createdAt?: number;
  updatedAt?: number;
}

// --- CheckpointStore interface ---

export interface CheckpointStore {
  // Sessions
  createSession(meta: SessionMeta): void;
  loadSession(sessionId: string): SessionMeta | undefined;
  updateSession(sessionId: string, patch: Partial<SessionMeta>): void;
  listSessions(): SessionMeta[];

  // Messages
  addMessages(sessionId: string, messages: LLMMessage[]): void;
  loadMessages(sessionId: string): LLMMessage[];

  // Checkpoints
  saveCheckpoint(checkpoint: FrozenContext): void;
  loadLatestCheckpoint(sessionId: string): FrozenContext | undefined;
  loadCheckpoint(sessionId: string, turnId: string): FrozenContext | undefined;

  // Event Log
  appendEvent(event: StoreEvent): void;
  queryEvents(sessionId: string, since?: number): StoreEvent[];

  // Config Snapshots
  saveConfigSnapshot(snapshot: ConfigSnapshot): void;
  loadLatestConfigSnapshot(sessionId: string): ConfigSnapshot | undefined;

  // Cost Records
  addCostRecord(record: CostRecord): void;
  loadCostRecords(sessionId: string): CostRecord[];
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
}

export interface CostRecord {
  sessionId: string;
  turnId: string;
  promptTokens: number;
  completionTokens: number;
  timestamp: number;
}

// --- In-memory implementation ---

export class InMemoryCheckpointStore implements CheckpointStore {
  private sessions = new Map<string, SessionMeta>();
  private messages = new Map<string, LLMMessage[]>();
  private checkpoints = new Map<string, FrozenContext[]>();
  private events: StoreEvent[] = [];
  private configSnapshots = new Map<string, ConfigSnapshot[]>();
  private costRecords = new Map<string, CostRecord[]>();

  // --- Sessions ---

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

  listSessions(): SessionMeta[] {
    return [...this.sessions.values()];
  }

  // --- Messages ---

  addMessages(sessionId: string, messages: LLMMessage[]): void {
    const existing = this.messages.get(sessionId) ?? [];
    existing.push(...messages);
    this.messages.set(sessionId, existing);
  }

  loadMessages(sessionId: string): LLMMessage[] {
    return [...(this.messages.get(sessionId) ?? [])];
  }

  // --- Checkpoints ---

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

  // --- Event Log ---

  appendEvent(event: StoreEvent): void {
    this.events.push(event);
  }

  queryEvents(sessionId: string, since?: number): StoreEvent[] {
    return this.events.filter(
      (e) => e.sessionId === sessionId && (since === undefined || e.timestamp >= since),
    );
  }

  // --- Config Snapshots ---

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

  // --- Cost Records ---

  addCostRecord(record: CostRecord): void {
    const existing = this.costRecords.get(record.sessionId) ?? [];
    existing.push(record);
    this.costRecords.set(record.sessionId, existing);
  }

  loadCostRecords(sessionId: string): CostRecord[] {
    return [...(this.costRecords.get(sessionId) ?? [])];
  }
}
