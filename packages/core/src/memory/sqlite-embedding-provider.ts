import Database from "better-sqlite3";
import type { LLMMessage } from "../types.js";
import type { EmbeddingProvider, EmbeddedEntry } from "./types.js";

let nextId = 0;

/**
 * SQLite-backed implementation of EmbeddingProvider.
 *
 * Stores message entries and their embeddings in a `memory_entries` table
 * with an `embedding_blob` column (BLOB of float64 values).
 */
export class SqliteEmbeddingProvider implements EmbeddingProvider {
  constructor(private readonly db: Database.Database) {
    this.migrate();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS memory_entries (
        id TEXT PRIMARY KEY,
        thread_id TEXT NOT NULL,
        payload TEXT NOT NULL,
        embedding_blob BLOB
      );
    `);
    // Add embedding_blob column to existing tables that lack it
    try {
      this.db.exec(`ALTER TABLE memory_entries ADD COLUMN embedding_blob BLOB`);
    } catch {
      /* column already exists */
    }
  }

  addEntry(threadId: string, entry: LLMMessage): string {
    const id = `entry-${++nextId}`;
    this.db
      .prepare("INSERT INTO memory_entries (id, thread_id, payload) VALUES (?, ?, ?)")
      .run(id, threadId, JSON.stringify(entry));
    return id;
  }

  loadEntries(threadId: string): EmbeddedEntry[] {
    const rows = this.db
      .prepare("SELECT id, thread_id, payload, embedding_blob FROM memory_entries WHERE thread_id = ?")
      .all(threadId) as Array<{
      id: string;
      thread_id: string;
      payload: string;
      embedding_blob: Buffer | null;
    }>;

    return rows.map((r) => ({
      id: r.id,
      threadId: r.thread_id,
      entry: JSON.parse(r.payload) as LLMMessage,
      embedding: r.embedding_blob
        ? new Float64Array(r.embedding_blob.buffer, r.embedding_blob.byteOffset, r.embedding_blob.byteLength / 8)
        : new Float64Array(0),
    }));
  }

  storeEmbedding(entryId: string, embedding: Float64Array): void {
    const buf = Buffer.from(embedding.buffer, embedding.byteOffset, embedding.byteLength);
    this.db
      .prepare("UPDATE memory_entries SET embedding_blob = ? WHERE id = ?")
      .run(buf, entryId);
  }

  getEmbedding(entryId: string): Float64Array | null {
    const row = this.db
      .prepare("SELECT embedding_blob FROM memory_entries WHERE id = ?")
      .get(entryId) as { embedding_blob: Buffer | null } | undefined;
    if (!row?.embedding_blob) return null;
    const buf = row.embedding_blob;
    return new Float64Array(buf.buffer, buf.byteOffset, buf.byteLength / 8);
  }
}
