// @proteus/core/memory -- barrel exports

// --- Core types ---
export type {
  MemoryEntry,
  WorkingMemoryData,
  MemoryThreadMeta,
  MemoryProvider,
  EmbeddingFunction,
  EmbeddedEntry,
  SemanticSearchResult,
  EmbeddingProvider,
} from "./types.js";

// --- Zod schemas ---
export {
  MemoryEntrySchema,
  WorkingMemoryDataSchema,
  MemoryThreadMetaSchema,
  MemoryConfigSchema,
  MemoryHistoryConfigSchema,
  MemorySemanticRecallConfigSchema,
  MemoryWorkingMemoryConfigSchema,
} from "./schemas.js";
export type {
  MemoryEntryInferred,
  MemoryThreadMetaInferred,
  MemoryConfig,
} from "./schemas.js";

// --- In-memory provider ---
export { InMemoryProvider, createInMemoryProvider } from "./in-memory-provider.js";

// --- SQLite provider ---
export { SqliteMemoryProvider } from "./sqlite-provider.js";

// --- Truncation ---
export { FIFOTruncation, SlidingWindowTruncation } from "./truncation.js";
export type { TruncationStrategy } from "./truncation.js";

// --- Conversation history ---
export { ConversationHistory } from "./conversation-history.js";
export type { ConversationHistoryOptions } from "./conversation-history.js";

// --- Structured working memory ---
export { StructuredWorkingMemory } from "./structured-working-memory.js";
export type { StructuredWorkingMemoryOptions } from "./structured-working-memory.js";

// --- Memory events ---
export {
  MEMORY_HISTORY_LOADED,
  MEMORY_SEMANTIC_QUERY,
  MEMORY_WORKING_MEMORY_UPDATED,
  MEMORY_TOOL_RECALL,
  MEMORY_TOOL_STORE,
  MemoryEventEmitter,
} from "./memory-events.js";
export type {
  MemoryHistoryLoadedPayload,
  MemorySemanticQueryPayload,
  MemoryWorkingMemoryUpdatedPayload,
  MemoryToolRecallPayload,
  MemoryToolStorePayload,
} from "./memory-events.js";

// --- Thread store adapter ---
export { ThreadStoreAdapter } from "./thread-store-adapter.js";

// --- Semantic recall ---
export { SemanticRecall, cosineSimilarity } from "./semantic-recall.js";
export type { SemanticRecallParams } from "./semantic-recall.js";
export { InMemoryEmbeddingProvider } from "./in-memory-embedding-provider.js";
export { SqliteEmbeddingProvider } from "./sqlite-embedding-provider.js";

// --- Memory tools ---
export { RecallTool } from "./tools/recall-tool.js";
export { StoreMemoryTool } from "./tools/store-memory-tool.js";
export { createMemoryTools } from "./tools/index.js";
