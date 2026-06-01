// @proteus/core/memory -- ThreadStoreAdapter: adapts MemoryProvider to ThreadStore interface

import type { ThreadStore, ThreadMeta } from "../checkpoint-store.js";
import type { LLMMessage } from "../types.js";
import type { MemoryProvider, MemoryEntry } from "./types.js";

/**
 * Wraps a MemoryProvider so it satisfies the ThreadStore interface.
 * This allows existing code that depends on ThreadStore to work
 * with the new MemoryProvider without modification.
 */
export class ThreadStoreAdapter implements ThreadStore {
  private readonly provider: MemoryProvider;

  constructor(provider: MemoryProvider) {
    this.provider = provider;
  }

  createThread(meta: ThreadMeta): void {
    this.provider.createThread({
      threadId: meta.threadId,
      name: meta.name,
      createdAt: meta.createdAt,
      updatedAt: meta.updatedAt,
    });
  }

  loadThread(threadId: string): ThreadMeta | undefined {
    const meta = this.provider.getThread(threadId);
    if (!meta) return undefined;
    return {
      threadId: meta.threadId,
      name: meta.name ?? "",
      createdAt: meta.createdAt,
      updatedAt: meta.updatedAt,
    };
  }

  updateThread(threadId: string, patch: Partial<Omit<ThreadMeta, "threadId">>): void {
    const existing = this.provider.getThread(threadId);
    if (!existing) return;
    this.provider.createThread({
      ...existing,
      ...patch,
      updatedAt: Date.now(),
    });
  }

  deleteThread(threadId: string): void {
    this.provider.deleteThread(threadId);
  }

  listThreads(): ThreadMeta[] {
    return this.provider.listThreads().map(meta => ({
      threadId: meta.threadId,
      name: meta.name ?? "",
      createdAt: meta.createdAt,
      updatedAt: meta.updatedAt,
    }));
  }

  addThreadMessages(threadId: string, messages: LLMMessage[]): void {
    let counter = 0;
    for (const msg of messages) {
      const entry: MemoryEntry = {
        id: `ts_${Date.now()}_${++counter}`,
        role: msg.role,
        content: msg.content,
        timestamp: Date.now(),
      };
      this.provider.addEntry(threadId, entry);
    }
  }

  loadThreadMessages(threadId: string): LLMMessage[] {
    const entries = this.provider.getHistory(threadId);
    return entries.map(e => ({ role: e.role, content: e.content }));
  }
}
