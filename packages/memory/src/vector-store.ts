import type { MemoryStore } from "./memory-store.js";
import type { MemoryEntry, MemoryQuery } from "./types.js";

/** Stub implementation — vector similarity search not yet implemented. */
export class VectorMemoryStore implements MemoryStore {
  async put(_entry: MemoryEntry): Promise<void> {
    throw new Error("not implemented");
  }

  async get(_id: string): Promise<MemoryEntry | undefined> {
    throw new Error("not implemented");
  }

  async delete(_id: string): Promise<void> {
    throw new Error("not implemented");
  }

  async search(_query: MemoryQuery): Promise<MemoryEntry[]> {
    throw new Error("not implemented");
  }

  async list(): Promise<MemoryEntry[]> {
    throw new Error("not implemented");
  }
}
