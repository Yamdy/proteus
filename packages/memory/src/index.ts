// @proteus/memory — public API surface

// --- Types ---
export type { MemoryEntry, MemoryQuery, CompactionResult } from "./types.js";

// --- MemoryStore ---
export type { MemoryStore } from "./memory-store.js";

// --- Embedding ---
export type { EmbeddingFunction } from "./embedding.js";
export { MockEmbeddingFunction } from "./embedding.js";

// --- Implementations ---
export { KvMemoryStore } from "./kv-store.js";
export {
  VectorMemoryStore,
  cosineSimilarity,
} from "./vector-store.js";
export type { VectorQuery } from "./vector-store.js";

// --- ContextCompactor ---
export { ContextCompactor } from "./compactor.js";
export type { ContextCompactorOptions, SummaryStrategy } from "./compactor.js";

// --- ProgressiveDisclosure ---
export { ProgressiveDisclosure } from "./progressive-disclosure.js";

// --- MemoryManager ---
export { MemoryManager } from "./memory-manager.js";
export type { MemoryManagerOptions, MemoryExtractor } from "./memory-manager.js";
