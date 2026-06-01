import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  MEMORY_HISTORY_LOADED,
  MEMORY_SEMANTIC_QUERY,
  MEMORY_WORKING_MEMORY_UPDATED,
  MEMORY_TOOL_RECALL,
  MEMORY_TOOL_STORE,
  MemoryEventEmitter,
} from "../memory-events.js";
import type { HandlerEngineHandle } from "../../context.js";

function mockHandlerEngine(): HandlerEngineHandle & { calls: Array<[string, unknown]> } {
  const calls: Array<[string, unknown]> = [];
  return {
    calls,
    getHandlers: () => [],
    emit: vi.fn(async (event: string, payload?: unknown) => {
      calls.push([event, payload]);
      return [];
    }),
  };
}

describe("Memory event constants", () => {
  it("defines all five event names as expected strings", () => {
    expect(MEMORY_HISTORY_LOADED).toBe("memory:history_loaded");
    expect(MEMORY_SEMANTIC_QUERY).toBe("memory:semantic_query");
    expect(MEMORY_WORKING_MEMORY_UPDATED).toBe("memory:working_memory_updated");
    expect(MEMORY_TOOL_RECALL).toBe("memory:tool_recall");
    expect(MEMORY_TOOL_STORE).toBe("memory:tool_store");
  });
});

describe("MemoryEventEmitter", () => {
  let engine: ReturnType<typeof mockHandlerEngine>;
  let emitter: MemoryEventEmitter;

  beforeEach(() => {
    engine = mockHandlerEngine();
    emitter = new MemoryEventEmitter(engine);
  });

  describe("emitHistoryLoaded", () => {
    it("emits MEMORY_HISTORY_LOADED with threadId and messageCount", async () => {
      await emitter.emitHistoryLoaded("t1", 5);
      expect(engine.emit).toHaveBeenCalledWith(MEMORY_HISTORY_LOADED, {
        threadId: "t1",
        messageCount: 5,
      });
    });
  });

  describe("emitSemanticQuery", () => {
    it("emits MEMORY_SEMANTIC_QUERY with threadId, query, and resultCount", async () => {
      await emitter.emitSemanticQuery("t1", "search term", 3);
      expect(engine.emit).toHaveBeenCalledWith(MEMORY_SEMANTIC_QUERY, {
        threadId: "t1",
        query: "search term",
        resultCount: 3,
      });
    });
  });

  describe("emitWorkingMemoryUpdated", () => {
    it("emits with threadId only when no key provided", async () => {
      await emitter.emitWorkingMemoryUpdated("t1");
      expect(engine.emit).toHaveBeenCalledWith(MEMORY_WORKING_MEMORY_UPDATED, {
        threadId: "t1",
        key: undefined,
      });
    });

    it("emits with threadId and key", async () => {
      await emitter.emitWorkingMemoryUpdated("t1", "user-preferences");
      expect(engine.emit).toHaveBeenCalledWith(MEMORY_WORKING_MEMORY_UPDATED, {
        threadId: "t1",
        key: "user-preferences",
      });
    });
  });

  describe("emitToolRecall", () => {
    it("emits MEMORY_TOOL_RECALL with threadId and query", async () => {
      await emitter.emitToolRecall("t1", "what did we discuss");
      expect(engine.emit).toHaveBeenCalledWith(MEMORY_TOOL_RECALL, {
        threadId: "t1",
        query: "what did we discuss",
        resultCount: undefined,
      });
    });

    it("emits with optional resultCount", async () => {
      await emitter.emitToolRecall("t1", "search", 7);
      expect(engine.emit).toHaveBeenCalledWith(MEMORY_TOOL_RECALL, {
        threadId: "t1",
        query: "search",
        resultCount: 7,
      });
    });
  });

  describe("emitToolStore", () => {
    it("emits MEMORY_TOOL_STORE with threadId and contentLength", async () => {
      await emitter.emitToolStore("t1", 256);
      expect(engine.emit).toHaveBeenCalledWith(MEMORY_TOOL_STORE, {
        threadId: "t1",
        contentLength: 256,
      });
    });
  });

  describe("error handling", () => {
    it("does not throw when handlerEngine.emit rejects", async () => {
      engine.emit = vi.fn(async () => {
        throw new Error("engine error");
      });
      emitter = new MemoryEventEmitter(engine);
      await expect(emitter.emitHistoryLoaded("t1", 1)).resolves.toBeUndefined();
    });
  });
});
