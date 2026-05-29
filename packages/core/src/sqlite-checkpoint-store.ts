import Database from "better-sqlite3";
import type { CheckpointStore, SessionMeta, StoreEvent, ConfigSnapshot, CostRecord } from "./checkpoint-store.js";
import type { LLMMessage, FrozenContext } from "./index.js";

export class SqliteCheckpointStore implements CheckpointStore {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.migrate();
  }

  private migrate(): void {
    this.db.pragma("journal_mode = WAL");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        session_id TEXT PRIMARY KEY,
        config TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        payload TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS checkpoints (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        turn_id TEXT NOT NULL,
        payload TEXT NOT NULL,
        timestamp INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS event_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        event TEXT NOT NULL,
        payload TEXT,
        timestamp INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS config_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        handlers TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        description TEXT,
        checksum TEXT
      );

      CREATE TABLE IF NOT EXISTS cost_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        turn_id TEXT NOT NULL,
        prompt_tokens INTEGER NOT NULL,
        completion_tokens INTEGER NOT NULL,
        timestamp INTEGER NOT NULL
      );
    `);
    // Migration: add description/checksum columns to existing config_snapshots tables
    try { this.db.exec(`ALTER TABLE config_snapshots ADD COLUMN description TEXT`); } catch { /* column exists */ }
    try { this.db.exec(`ALTER TABLE config_snapshots ADD COLUMN checksum TEXT`); } catch { /* column exists */ }
  }

  getTableNames(): string[] {
    const rows = this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all() as { name: string }[];
    return rows.map((r) => r.name);
  }

  getJournalMode(): string {
    const row = this.db.pragma("journal_mode", { simple: true });
    return row as string;
  }

  close(): void {
    this.db.close();
  }

  // --- Sessions ---

  createSession(meta: SessionMeta): void {
    const now = Date.now();
    this.db.prepare("INSERT INTO sessions (session_id, config, created_at, updated_at) VALUES (?, ?, ?, ?)").run(
      meta.sessionId,
      JSON.stringify(meta.config),
      meta.createdAt ?? now,
      meta.updatedAt ?? now,
    );
  }

  loadSession(sessionId: string): SessionMeta | undefined {
    const row = this.db.prepare("SELECT session_id, config, created_at, updated_at FROM sessions WHERE session_id = ?").get(sessionId) as any;
    if (!row) return undefined;
    return { sessionId: row.session_id, config: JSON.parse(row.config), createdAt: row.created_at, updatedAt: row.updated_at };
  }

  updateSession(sessionId: string, patch: Partial<SessionMeta>): void {
    const existing = this.loadSession(sessionId);
    if (!existing) return;
    const merged = { ...existing, ...patch, updatedAt: Date.now() };
    this.db.prepare("UPDATE sessions SET config = ?, updated_at = ? WHERE session_id = ?").run(
      JSON.stringify(merged.config),
      merged.updatedAt,
      sessionId,
    );
  }

  listSessions(): SessionMeta[] {
    const rows = this.db.prepare("SELECT session_id, config, created_at, updated_at FROM sessions").all() as any[];
    return rows.map((r) => ({ sessionId: r.session_id, config: JSON.parse(r.config), createdAt: r.created_at, updatedAt: r.updated_at }));
  }

  // --- Messages ---

  addMessages(sessionId: string, messages: LLMMessage[]): void {
    const stmt = this.db.prepare("INSERT INTO messages (session_id, payload) VALUES (?, ?)");
    for (const msg of messages) {
      stmt.run(sessionId, JSON.stringify(msg));
    }
  }

  loadMessages(sessionId: string): LLMMessage[] {
    const rows = this.db.prepare("SELECT payload FROM messages WHERE session_id = ?").all(sessionId) as { payload: string }[];
    return rows.map((r) => JSON.parse(r.payload));
  }

  // --- Checkpoints ---

  saveCheckpoint(checkpoint: FrozenContext): void {
    this.db.prepare("INSERT INTO checkpoints (session_id, turn_id, payload, timestamp) VALUES (?, ?, ?, ?)").run(
      checkpoint.sessionId,
      checkpoint.turnId,
      JSON.stringify(checkpoint),
      checkpoint.timestamp,
    );
  }

  loadLatestCheckpoint(sessionId: string): FrozenContext | undefined {
    const row = this.db.prepare("SELECT payload FROM checkpoints WHERE session_id = ? ORDER BY timestamp DESC LIMIT 1").get(sessionId) as { payload: string } | undefined;
    if (!row) return undefined;
    return JSON.parse(row.payload);
  }

  loadCheckpoint(sessionId: string, turnId: string): FrozenContext | undefined {
    const row = this.db.prepare("SELECT payload FROM checkpoints WHERE session_id = ? AND turn_id = ?").get(sessionId, turnId) as { payload: string } | undefined;
    if (!row) return undefined;
    return JSON.parse(row.payload);
  }

  // --- Event Log ---

  appendEvent(event: StoreEvent): void {
    this.db.prepare("INSERT INTO event_log (session_id, event, payload, timestamp) VALUES (?, ?, ?, ?)").run(
      event.sessionId,
      event.event,
      event.payload !== undefined ? JSON.stringify(event.payload) : null,
      event.timestamp,
    );
  }

  queryEvents(sessionId: string, since?: number): StoreEvent[] {
    if (since !== undefined) {
      const rows = this.db.prepare("SELECT session_id, event, payload, timestamp FROM event_log WHERE session_id = ? AND timestamp >= ? ORDER BY timestamp").all(sessionId, since) as any[];
      return rows.map((r) => ({ sessionId: r.session_id, event: r.event, payload: r.payload ? JSON.parse(r.payload) : undefined, timestamp: r.timestamp }));
    }
    const rows = this.db.prepare("SELECT session_id, event, payload, timestamp FROM event_log WHERE session_id = ? ORDER BY timestamp").all(sessionId) as any[];
    return rows.map((r) => ({ sessionId: r.session_id, event: r.event, payload: r.payload ? JSON.parse(r.payload) : undefined, timestamp: r.timestamp }));
  }

  // --- Config Snapshots ---

  saveConfigSnapshot(snapshot: ConfigSnapshot): void {
    this.db.prepare("INSERT INTO config_snapshots (session_id, handlers, timestamp, description, checksum) VALUES (?, ?, ?, ?, ?)").run(
      snapshot.sessionId,
      JSON.stringify(snapshot.handlers),
      snapshot.timestamp,
      snapshot.description ?? null,
      snapshot.checksum ?? null,
    );
  }

  loadLatestConfigSnapshot(sessionId: string): ConfigSnapshot | undefined {
    const row = this.db.prepare("SELECT handlers, timestamp, description, checksum FROM config_snapshots WHERE session_id = ? ORDER BY timestamp DESC LIMIT 1").get(sessionId) as { handlers: string; timestamp: number; description: string | null; checksum: string | null } | undefined;
    if (!row) return undefined;
    return { sessionId, handlers: JSON.parse(row.handlers), timestamp: row.timestamp, description: row.description ?? undefined, checksum: row.checksum ?? undefined };
  }

  listConfigSnapshots(sessionId: string): ConfigSnapshot[] {
    const rows = this.db.prepare("SELECT handlers, timestamp, description, checksum FROM config_snapshots WHERE session_id = ? ORDER BY timestamp").all(sessionId) as { handlers: string; timestamp: number; description: string | null; checksum: string | null }[];
    return rows.map((r) => ({ sessionId, handlers: JSON.parse(r.handlers), timestamp: r.timestamp, description: r.description ?? undefined, checksum: r.checksum ?? undefined }));
  }

  // --- Cost Records ---

  addCostRecord(record: CostRecord): void {
    this.db.prepare("INSERT INTO cost_records (session_id, turn_id, prompt_tokens, completion_tokens, timestamp) VALUES (?, ?, ?, ?, ?)").run(
      record.sessionId,
      record.turnId,
      record.promptTokens,
      record.completionTokens,
      record.timestamp,
    );
  }

  loadCostRecords(sessionId: string): CostRecord[] {
    const rows = this.db.prepare("SELECT turn_id, prompt_tokens, completion_tokens, timestamp FROM cost_records WHERE session_id = ?").all(sessionId) as any[];
    return rows.map((r) => ({ sessionId, turnId: r.turn_id, promptTokens: r.prompt_tokens, completionTokens: r.completion_tokens, timestamp: r.timestamp }));
  }
}
