/** A stored memory entry */
export interface MemoryEntry {
  id: string;
  content: string;
  metadata: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

/** Query parameters for searching memories */
export interface MemoryQuery {
  filter?: Record<string, unknown>;
  limit?: number;
  offset?: number;
}

/** Result of context compaction */
export interface CompactionResult {
  messages: import("@proteus/core").LLMMessage[];
  originalCount: number;
  compactedCount: number;
  strategy: "full" | "compacted";
}
