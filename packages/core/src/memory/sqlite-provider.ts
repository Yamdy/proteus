import Database from "better-sqlite3";
import type { MemoryProvider, MemoryEntry, WorkingMemoryData, MemoryThreadMeta } from "./types.js";

function migrateMemory(db: Database.Database): void {
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS memory_entries (
      id TEXT NOT NULL,
      thread_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      metadata_json TEXT,
      PRIMARY KEY (id, thread_id)
    );
    CREATE TABLE IF NOT EXISTS working_memory (
      thread_id TEXT PRIMARY KEY,
      data_json TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS memory_threads (
      thread_id TEXT PRIMARY KEY,
      session_id TEXT,
      name TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_memory_entries_thread ON memory_entries (thread_id, timestamp);
  `);
}

export class SqliteMemoryProvider implements MemoryProvider {
  private readonly db: Database.Database;

  constructor(dbOrPath: string | Database.Database) {
    this.db = typeof dbOrPath === "string" ? new Database(dbOrPath) : dbOrPath;
    migrateMemory(this.db);
  }

  close(): void { this.db.close(); }

  // --- History ---

  addEntry(threadId: string, entry: MemoryEntry): void {
    this.db.prepare(
      "INSERT OR REPLACE INTO memory_entries (id, thread_id, role, content, timestamp, metadata_json) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(
      entry.id, threadId, entry.role, entry.content, entry.timestamp,
      entry.metadata ? JSON.stringify(entry.metadata) : null,
    );
  }

  getHistory(threadId: string, limit?: number): MemoryEntry[] {
    let rows: unknown[];
    if (limit !== undefined && limit >= 0) {
      rows = this.db.prepare(
        "SELECT id, role, content, timestamp, metadata_json FROM memory_entries WHERE thread_id = ? ORDER BY timestamp ASC LIMIT ? OFFSET (SELECT MAX(0, COUNT(*) - ?) FROM memory_entries WHERE thread_id = ?)"
      ).all(threadId, limit, limit, threadId);
    } else {
      rows = this.db.prepare(
        "SELECT id, role, content, timestamp, metadata_json FROM memory_entries WHERE thread_id = ? ORDER BY timestamp ASC"
      ).all(threadId);
    }
    return (rows as Array<Record<string, unknown>>).map(rowToEntry);
  }

  deleteEntry(threadId: string, entryId: string): void {
    this.db.prepare("DELETE FROM memory_entries WHERE thread_id = ? AND id = ?").run(threadId, entryId);
  }

  clearHistory(threadId: string): void {
    this.db.prepare("DELETE FROM memory_entries WHERE thread_id = ?").run(threadId);
  }

  // --- Working memory ---

  getWorkingMemory(threadId: string): WorkingMemoryData {
    const row = this.db.prepare("SELECT data_json FROM working_memory WHERE thread_id = ?").get(threadId) as { data_json: string } | undefined;
    return row ? JSON.parse(row.data_json) as WorkingMemoryData : {};
  }

  setWorkingMemory(threadId: string, data: WorkingMemoryData): void {
    this.db.prepare("INSERT OR REPLACE INTO working_memory (thread_id, data_json) VALUES (?, ?)").run(
      threadId, JSON.stringify(data),
    );
  }

  mergeWorkingMemory(threadId: string, partial: WorkingMemoryData): void {
    const existing = this.getWorkingMemory(threadId);
    this.setWorkingMemory(threadId, { ...existing, ...partial });
  }

  // --- Threads ---

  createThread(meta: MemoryThreadMeta): void {
    const now = Date.now();
    this.db.prepare(
      "INSERT OR REPLACE INTO memory_threads (thread_id, session_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
    ).run(
      meta.threadId,
      meta.sessionId ?? null,
      meta.name ?? null,
      meta.createdAt ?? now,
      meta.updatedAt ?? now,
    );
  }

  getThread(threadId: string): MemoryThreadMeta | undefined {
    const row = this.db.prepare(
      "SELECT thread_id, session_id, name, created_at, updated_at FROM memory_threads WHERE thread_id = ?"
    ).get(threadId) as Record<string, unknown> | undefined;
    return row ? rowToThread(row) : undefined;
  }

  listThreads(sessionId?: string): MemoryThreadMeta[] {
    let rows: unknown[];
    if (sessionId !== undefined) {
      rows = this.db.prepare(
        "SELECT thread_id, session_id, name, created_at, updated_at FROM memory_threads WHERE session_id = ?"
      ).all(sessionId);
    } else {
      rows = this.db.prepare(
        "SELECT thread_id, session_id, name, created_at, updated_at FROM memory_threads"
      ).all();
    }
    return (rows as Array<Record<string, unknown>>).map(rowToThread);
  }

  deleteThread(threadId: string): void {
    this.db.prepare("DELETE FROM memory_threads WHERE thread_id = ?").run(threadId);
    this.db.prepare("DELETE FROM memory_entries WHERE thread_id = ?").run(threadId);
    this.db.prepare("DELETE FROM working_memory WHERE thread_id = ?").run(threadId);
  }

  cloneThread(threadId: string, newMeta: Partial<MemoryThreadMeta> & { threadId: string }): MemoryThreadMeta | undefined {
    const existing = this.getThread(threadId);
    if (!existing) return undefined;

    const now = Date.now();
    const cloned: MemoryThreadMeta = {
      ...existing,
      ...newMeta,
      createdAt: now,
      updatedAt: now,
    };
    this.createThread(cloned);

    // Clone history entries
    const entries = this.db.prepare(
      "SELECT id, role, content, timestamp, metadata_json FROM memory_entries WHERE thread_id = ? ORDER BY timestamp ASC"
    ).all(threadId) as Array<Record<string, unknown>>;
    const insertStmt = this.db.prepare(
      "INSERT OR REPLACE INTO memory_entries (id, thread_id, role, content, timestamp, metadata_json) VALUES (?, ?, ?, ?, ?, ?)"
    );
    for (const row of entries) {
      insertStmt.run(
        row.id, cloned.threadId, row.role, row.content, row.timestamp, row.metadata_json,
      );
    }

    // Clone working memory
    const wmRow = this.db.prepare("SELECT data_json FROM working_memory WHERE thread_id = ?").get(threadId) as { data_json: string } | undefined;
    if (wmRow) {
      this.db.prepare("INSERT OR REPLACE INTO working_memory (thread_id, data_json) VALUES (?, ?)").run(
        cloned.threadId, wmRow.data_json,
      );
    }

    return cloned;
  }
}

// --- Row mapping helpers ---

function rowToEntry(row: Record<string, unknown>): MemoryEntry {
  const entry: MemoryEntry = {
    id: row.id as string,
    role: row.role as MemoryEntry["role"],
    content: row.content as string,
    timestamp: row.timestamp as number,
  };
  if (row.metadata_json) {
    entry.metadata = JSON.parse(row.metadata_json as string);
  }
  return entry;
}

function rowToThread(row: Record<string, unknown>): MemoryThreadMeta {
  return {
    threadId: row.thread_id as string,
    sessionId: row.session_id as string | undefined,
    name: row.name as string | undefined,
    createdAt: row.created_at as number,
    updatedAt: row.updated_at as number,
  };
}
