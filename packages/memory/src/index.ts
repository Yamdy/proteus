// @proteus/memory — public API surface

// --- Types ---
export type { MemoryEntry, MemoryQuery, CompactionResult } from "./types.js";

// --- MemoryStore ---
export type { MemoryStore } from "./memory-store.js";

// --- Implementations ---
export { KvMemoryStore } from "./kv-store.js";
export { VectorMemoryStore } from "./vector-store.js";

// --- ContextCompactor ---
export { ContextCompactor } from "./compactor.js";
export type { ContextCompactorOptions } from "./compactor.js";

// --- ProgressiveDisclosure ---
export { ProgressiveDisclosure } from "./progressive-disclosure.js";
