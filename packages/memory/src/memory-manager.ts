import type { LLMMessage } from "@proteus/core";
import type { MemoryStore } from "./memory-store.js";
import type { MemoryEntry } from "./types.js";

// --- MemoryManager options ---

export interface MemoryManagerOptions {
  /** Memory store backend (KvMemoryStore, VectorMemoryStore, etc.) */
  store: MemoryStore;

  /**
   * Custom extractor that derives MemoryEntry objects from the turn's messages.
   * If omitted, the default extractor captures user and assistant content.
   */
  extractor?: MemoryExtractor;

  /**
   * Automatically write extracted memories at the end of each turn.
   * Default: true
   */
  autoWrite?: boolean;

  /**
   * Automatically retrieve relevant memories before context assembly.
   * Default: true
   */
  autoRead?: boolean;

  /**
   * Maximum number of memories to write per turn.
   * Default: 5
   */
  maxMemoriesPerTurn?: number;

  /**
   * Maximum number of memories to retrieve during context assembly.
   * Default: 10
   */
  maxRetrievedMemories?: number;
}

/** Signature for a function that extracts memory entries from turn messages. */
export type MemoryExtractor = (messages: LLMMessage[]) => MemoryEntry[];

// --- Default extractor ---

let _idCounter = 0;

/** Default extractor: creates a MemoryEntry for each user/assistant message. */
function defaultExtractor(messages: LLMMessage[]): MemoryEntry[] {
  const entries: MemoryEntry[] = [];
  const now = Date.now();

  for (const msg of messages) {
    if (msg.role !== "user" && msg.role !== "assistant") continue;
    if (!msg.content || msg.content.trim() === "") continue;

    entries.push({
      id: `mem-${now}-${++_idCounter}`,
      content: msg.content,
      metadata: { role: msg.role },
      createdAt: now,
      updatedAt: now,
    });
  }

  return entries;
}

// --- MemoryManager ---

/**
 * MemoryManager — orchestrates memory extraction and retrieval.
 *
 * - {@link onTurnEnd} extracts memories from turn messages and persists them
 *   to the underlying store (when autoWrite is enabled).
 * - {@link beforeContextAssembly} retrieves memories relevant to a query
 *   and returns them for injection into the context window (when autoRead is
 *   enabled).
 */
export class MemoryManager {
  private readonly store: MemoryStore;
  private readonly extractor: MemoryExtractor;
  private readonly autoWrite: boolean;
  private readonly autoRead: boolean;
  private readonly maxMemoriesPerTurn: number;
  private readonly maxRetrievedMemories: number;

  constructor(opts: MemoryManagerOptions) {
    this.store = opts.store;
    this.extractor = opts.extractor ?? defaultExtractor;
    this.autoWrite = opts.autoWrite ?? true;
    this.autoRead = opts.autoRead ?? true;
    this.maxMemoriesPerTurn = opts.maxMemoriesPerTurn ?? 5;
    this.maxRetrievedMemories = opts.maxRetrievedMemories ?? 10;
  }

  /**
   * Called at the end of a turn. Extracts memory entries from the turn's
   * messages and writes them to the store when autoWrite is enabled.
   *
   * Returns the entries that were extracted (regardless of whether they
   * were persisted).
   */
  async onTurnEnd(messages: LLMMessage[]): Promise<MemoryEntry[]> {
    const extracted = this.extractor(messages).slice(0, this.maxMemoriesPerTurn);

    if (this.autoWrite && extracted.length > 0) {
      for (const entry of extracted) {
        await this.store.put(entry);
      }
    }

    return extracted;
  }

  /**
   * Called before context assembly. Retrieves memories from the store that
   * match the given query text and returns them for injection into the
   * context window.
   *
   * When autoRead is disabled, returns an empty array.
   */
  async beforeContextAssembly(query: string): Promise<MemoryEntry[]> {
    if (!this.autoRead) return [];

    const results = await this.store.search({
      filter: {},
      limit: this.maxRetrievedMemories,
    });

    // Simple relevance filter: keep entries whose content mentions
    // at least one word from the query (case-insensitive).
    if (query.trim() === "") return results;

    const queryWords = new Set(
      query
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 0),
    );

    const relevant = results.filter((entry) => {
      const lower = entry.content.toLowerCase();
      for (const word of queryWords) {
        if (lower.includes(word)) return true;
      }
      return false;
    });

    return relevant.slice(0, this.maxRetrievedMemories);
  }

  /** Expose the underlying store for direct access when needed. */
  getStore(): MemoryStore {
    return this.store;
  }
}
