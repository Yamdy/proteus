import type { MemoryEntry, MemoryQuery } from "./types.js";

/**
 * Generic memory store interface.
 * Implementations range from in-memory (KvMemoryStore) to vector-database-backed (VectorMemoryStore).
 */
export interface MemoryStore {
  put(entry: MemoryEntry): Promise<void>;
  get(id: string): Promise<MemoryEntry | undefined>;
  delete(id: string): Promise<void>;
  search(query: MemoryQuery): Promise<MemoryEntry[]>;
  list(): Promise<MemoryEntry[]>;
}
