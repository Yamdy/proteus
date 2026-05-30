import { describe, it, expect, beforeEach } from "vitest";
import { MemoryManager } from "./memory-manager.js";
import { KvMemoryStore } from "./kv-store.js";
import type { LLMMessage } from "@proteus/core";
import type { MemoryEntry } from "./types.js";

function msg(role: LLMMessage["role"], content: string): LLMMessage {
  return { role, content };
}

describe("MemoryManager", () => {
  let store: KvMemoryStore;

  beforeEach(() => {
    store = new KvMemoryStore();
  });

  // --- onTurnEnd ---

  describe("onTurnEnd", () => {
    it("extracts and persists user and assistant messages", async () => {
      const manager = new MemoryManager({ store });
      const messages: LLMMessage[] = [
        msg("system", "You are helpful."),
        msg("user", "Tell me about TypeScript"),
        msg("assistant", "TypeScript is a typed superset of JavaScript."),
      ];

      const extracted = await manager.onTurnEnd(messages);

      expect(extracted).toHaveLength(2);
      expect(extracted[0].metadata.role).toBe("user");
      expect(extracted[1].metadata.role).toBe("assistant");

      // Verify persistence
      const all = await store.list();
      expect(all).toHaveLength(2);
    });

    it("respects maxMemoriesPerTurn", async () => {
      const manager = new MemoryManager({ store, maxMemoriesPerTurn: 2 });
      const messages: LLMMessage[] = [
        msg("user", "a"),
        msg("assistant", "b"),
        msg("user", "c"),
        msg("assistant", "d"),
      ];

      const extracted = await manager.onTurnEnd(messages);
      expect(extracted).toHaveLength(2);
    });

    it("does not persist when autoWrite is false", async () => {
      const manager = new MemoryManager({ store, autoWrite: false });
      const messages: LLMMessage[] = [
        msg("user", "hello"),
        msg("assistant", "hi there"),
      ];

      const extracted = await manager.onTurnEnd(messages);
      expect(extracted).toHaveLength(2);

      const all = await store.list();
      expect(all).toHaveLength(0);
    });

    it("skips system and tool messages", async () => {
      const manager = new MemoryManager({ store });
      const messages: LLMMessage[] = [
        msg("system", "system prompt"),
        msg("tool", '{"result":"ok"}'),
      ];

      const extracted = await manager.onTurnEnd(messages);
      expect(extracted).toHaveLength(0);
    });

    it("skips empty content messages", async () => {
      const manager = new MemoryManager({ store });
      const messages: LLMMessage[] = [
        msg("user", ""),
        msg("user", "   "),
        msg("assistant", "actual content"),
      ];

      const extracted = await manager.onTurnEnd(messages);
      expect(extracted).toHaveLength(1);
      expect(extracted[0].content).toBe("actual content");
    });

    it("returns empty array for empty input", async () => {
      const manager = new MemoryManager({ store });
      const extracted = await manager.onTurnEnd([]);
      expect(extracted).toEqual([]);
    });

    it("uses custom extractor when provided", async () => {
      const customEntries: MemoryEntry[] = [
        { id: "custom-1", content: "custom memory", metadata: { source: "custom" }, createdAt: 100, updatedAt: 100 },
      ];
      const manager = new MemoryManager({
        store,
        extractor: (_messages: LLMMessage[]) => customEntries,
      });

      const extracted = await manager.onTurnEnd([msg("user", "hello")]);
      expect(extracted).toEqual(customEntries);

      const all = await store.list();
      expect(all).toHaveLength(1);
      expect(all[0].content).toBe("custom memory");
    });
  });

  // --- beforeContextAssembly ---

  describe("beforeContextAssembly", () => {
    it("returns empty array when autoRead is false", async () => {
      const manager = new MemoryManager({ store, autoRead: false });
      await store.put({ id: "m1", content: "TypeScript is great", metadata: {}, createdAt: 1, updatedAt: 1 });

      const results = await manager.beforeContextAssembly("TypeScript");
      expect(results).toEqual([]);
    });

    it("returns matching memories based on query keywords", async () => {
      const manager = new MemoryManager({ store });
      await store.put({ id: "m1", content: "TypeScript is a typed language", metadata: {}, createdAt: 1, updatedAt: 1 });
      await store.put({ id: "m2", content: "Python is dynamic", metadata: {}, createdAt: 2, updatedAt: 2 });
      await store.put({ id: "m3", content: "TypeScript compiles to JavaScript", metadata: {}, createdAt: 3, updatedAt: 3 });

      const results = await manager.beforeContextAssembly("TypeScript compiler");
      expect(results).toHaveLength(2);
      expect(results.map((r) => r.id).sort()).toEqual(["m1", "m3"]);
    });

    it("returns all results when query is empty", async () => {
      const manager = new MemoryManager({ store });
      await store.put({ id: "m1", content: "a", metadata: {}, createdAt: 1, updatedAt: 1 });
      await store.put({ id: "m2", content: "b", metadata: {}, createdAt: 2, updatedAt: 2 });

      const results = await manager.beforeContextAssembly("");
      expect(results).toHaveLength(2);
    });

    it("returns all results when query is whitespace only", async () => {
      const manager = new MemoryManager({ store });
      await store.put({ id: "m1", content: "a", metadata: {}, createdAt: 1, updatedAt: 1 });

      const results = await manager.beforeContextAssembly("   ");
      expect(results).toHaveLength(1);
    });

    it("respects maxRetrievedMemories", async () => {
      const manager = new MemoryManager({ store, maxRetrievedMemories: 2 });
      await store.put({ id: "m1", content: "test item one", metadata: {}, createdAt: 1, updatedAt: 1 });
      await store.put({ id: "m2", content: "test item two", metadata: {}, createdAt: 2, updatedAt: 2 });
      await store.put({ id: "m3", content: "test item three", metadata: {}, createdAt: 3, updatedAt: 3 });

      const results = await manager.beforeContextAssembly("test");
      expect(results).toHaveLength(2);
    });

    it("keyword matching is case-insensitive", async () => {
      const manager = new MemoryManager({ store });
      await store.put({ id: "m1", content: "TypeScript is GREAT", metadata: {}, createdAt: 1, updatedAt: 1 });

      const results = await manager.beforeContextAssembly("typescript");
      expect(results).toHaveLength(1);
    });
  });

  // --- integration: onTurnEnd + beforeContextAssembly ---

  describe("integration", () => {
    it("memories written via onTurnEnd are retrievable via beforeContextAssembly", async () => {
      const manager = new MemoryManager({ store });

      await manager.onTurnEnd([
        msg("user", "I love Rust programming"),
        msg("assistant", "Rust is a systems language"),
      ]);

      const results = await manager.beforeContextAssembly("Rust");
      expect(results).toHaveLength(2);
      expect(results[0].content).toContain("Rust");
    });

    it("full round-trip with custom extractor and retrieval", async () => {
      let callCount = 0;
      const manager = new MemoryManager({
        store,
        extractor: (messages: LLMMessage[]) => {
          callCount++;
          return messages
            .filter((m) => m.role === "user")
            .map((m) => ({
              id: `custom-${callCount}`,
              content: m.content.toUpperCase(),
              metadata: { custom: true },
              createdAt: 100,
              updatedAt: 100,
            }));
        },
      });

      await manager.onTurnEnd([msg("user", "hello world"), msg("assistant", "hi")]);
      expect(callCount).toBe(1);

      const results = await manager.beforeContextAssembly("HELLO");
      expect(results).toHaveLength(1);
      expect(results[0].content).toBe("HELLO WORLD");
      expect(results[0].metadata.custom).toBe(true);
    });
  });

  // --- getStore ---

  describe("getStore", () => {
    it("returns the underlying store", () => {
      const manager = new MemoryManager({ store });
      expect(manager.getStore()).toBe(store);
    });
  });

  // --- defaults ---

  describe("defaults", () => {
    it("autoWrite defaults to true", async () => {
      const manager = new MemoryManager({ store });
      await manager.onTurnEnd([msg("user", "test")]);
      const all = await store.list();
      expect(all).toHaveLength(1);
    });

    it("autoRead defaults to true", async () => {
      const manager = new MemoryManager({ store });
      await store.put({ id: "m1", content: "test content", metadata: {}, createdAt: 1, updatedAt: 1 });
      const results = await manager.beforeContextAssembly("test");
      expect(results).toHaveLength(1);
    });

    it("maxMemoriesPerTurn defaults to 5", async () => {
      const manager = new MemoryManager({ store });
      const messages: LLMMessage[] = Array.from({ length: 10 }, (_, i) =>
        msg(i % 2 === 0 ? "user" : "assistant", `msg ${i}`),
      );
      const extracted = await manager.onTurnEnd(messages);
      expect(extracted).toHaveLength(5);
    });

    it("maxRetrievedMemories defaults to 10", async () => {
      const manager = new MemoryManager({ store });
      for (let i = 0; i < 15; i++) {
        await store.put({ id: `m${i}`, content: `item ${i}`, metadata: {}, createdAt: i, updatedAt: i });
      }
      const results = await manager.beforeContextAssembly("");
      expect(results).toHaveLength(10);
    });
  });
});
