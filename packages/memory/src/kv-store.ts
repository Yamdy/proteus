import type { MemoryStore } from "./memory-store.js";
import type { MemoryEntry, MemoryQuery } from "./types.js";

/** Map-based in-memory MemoryStore implementation. */
export class KvMemoryStore implements MemoryStore {
  private store = new Map<string, MemoryEntry>();

  async put(entry: MemoryEntry): Promise<void> {
    this.store.set(entry.id, { ...entry });
  }

  async get(id: string): Promise<MemoryEntry | undefined> {
    const entry = this.store.get(id);
    return entry ? { ...entry } : undefined;
  }

  async delete(id: string): Promise<void> {
    this.store.delete(id);
  }

  async search(query: MemoryQuery): Promise<MemoryEntry[]> {
    let results = [...this.store.values()];
    if (query.filter) {
      results = results.filter((entry) =>
        Object.entries(query.filter!).every(
          ([key, value]) => entry.metadata[key] === value,
        ),
      );
    }
    if (query.offset) {
      results = results.slice(query.offset);
    }
    if (query.limit) {
      results = results.slice(0, query.limit);
    }
    return results;
  }

  async list(): Promise<MemoryEntry[]> {
    return [...this.store.values()];
  }
}
