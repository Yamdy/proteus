// @proteus/core/memory -- Memory event constants and emitter

import type { HandlerEngineHandle } from "../context.js";

// --- Event constants ---

export const MEMORY_HISTORY_LOADED = "memory:history_loaded";
export const MEMORY_SEMANTIC_QUERY = "memory:semantic_query";
export const MEMORY_WORKING_MEMORY_UPDATED = "memory:working_memory_updated";
export const MEMORY_TOOL_RECALL = "memory:tool_recall";
export const MEMORY_TOOL_STORE = "memory:tool_store";

// --- Payload types ---

export interface MemoryHistoryLoadedPayload {
  threadId: string;
  messageCount: number;
}

export interface MemorySemanticQueryPayload {
  threadId: string;
  query: string;
  resultCount: number;
}

export interface MemoryWorkingMemoryUpdatedPayload {
  threadId: string;
  key?: string;
}

export interface MemoryToolRecallPayload {
  threadId: string;
  query: string;
  resultCount?: number;
}

export interface MemoryToolStorePayload {
  threadId: string;
  contentLength: number;
}

// --- MemoryEventEmitter ---

export class MemoryEventEmitter {
  private readonly engine: HandlerEngineHandle;

  constructor(engine: HandlerEngineHandle) {
    this.engine = engine;
  }

  async emitHistoryLoaded(threadId: string, messageCount: number): Promise<void> {
    await this.safeEmit(MEMORY_HISTORY_LOADED, { threadId, messageCount });
  }

  async emitSemanticQuery(threadId: string, query: string, resultCount: number): Promise<void> {
    await this.safeEmit(MEMORY_SEMANTIC_QUERY, { threadId, query, resultCount });
  }

  async emitWorkingMemoryUpdated(threadId: string, key?: string): Promise<void> {
    await this.safeEmit(MEMORY_WORKING_MEMORY_UPDATED, { threadId, key });
  }

  async emitToolRecall(threadId: string, query: string, resultCount?: number): Promise<void> {
    await this.safeEmit(MEMORY_TOOL_RECALL, { threadId, query, resultCount });
  }

  async emitToolStore(threadId: string, contentLength: number): Promise<void> {
    await this.safeEmit(MEMORY_TOOL_STORE, { threadId, contentLength });
  }

  private async safeEmit(event: string, payload: unknown): Promise<void> {
    try {
      await this.engine.emit(event, payload);
    } catch {
      // Swallow emit errors to avoid breaking caller flows
    }
  }
}
