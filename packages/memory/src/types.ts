/** A stored memory entry */
export interface MemoryEntry {
  id: string;
  content: string;
  metadata: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
  /** Optional embedding vector for similarity search */
  embedding?: number[];
  /** Optional importance score (higher = more important) */
  importance?: number;
}

/** Query parameters for searching memories */
export interface MemoryQuery {
  /** Text to embed and search against (used by vector stores). */
  text?: string;
  filter?: Record<string, unknown>;
  limit?: number;
  offset?: number;
}

/** Result of context compaction */
export interface CompactionResult {
  messages: import("@proteus/core").LLMMessage[];
  originalCount: number;
  compactedCount: number;
  strategy: "full" | "compacted" | "llm";
  /** Running summary of compacted messages. Omitted when strategy is "full". */
  summary?: string;
  /** Number of non-system, non-tool messages that have been summarized. Used for incremental summarization. */
  summarizedCount?: number;
}
