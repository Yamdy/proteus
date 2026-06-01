import { describe, it, expect, beforeEach } from "vitest";
import type { MemoryProvider, MemoryEntry, MemoryThreadMeta } from "../types.js";

function makeEntry(overrides?: Partial<MemoryEntry>): MemoryEntry {
  return { id: "e1", role: "user", content: "hello", timestamp: 1000, ...overrides };
}

function makeMeta(overrides?: Partial<MemoryThreadMeta>): MemoryThreadMeta {
  return { threadId: "t1", sessionId: "s1", name: "Test Thread", createdAt: 1000, updatedAt: 1000, ...overrides };
}

export function runConformanceTests(createProvider: () => MemoryProvider): void {
  describe("MemoryProvider conformance", () => {
    let provider: MemoryProvider;
    beforeEach(() => { provider = createProvider(); });

    describe("addEntry / getHistory", () => {
      it("round-trips an entry", () => {
        provider.createThread(makeMeta());
        provider.addEntry("t1", makeEntry());
        const h = provider.getHistory("t1");
        expect(h).toHaveLength(1);
        expect(h[0].id).toBe("e1");
        expect(h[0].role).toBe("user");
        expect(h[0].content).toBe("hello");
      });
      it("appends entries", () => {
        provider.createThread(makeMeta());
        provider.addEntry("t1", makeEntry({ id: "e1", content: "first" }));
        provider.addEntry("t1", makeEntry({ id: "e2", content: "second" }));
        const h = provider.getHistory("t1");
        expect(h).toHaveLength(2);
        expect(h[0].content).toBe("first");
        expect(h[1].content).toBe("second");
      });
      it("empty for no entries", () => {
        provider.createThread(makeMeta());
        expect(provider.getHistory("t1")).toEqual([]);
      });
      it("empty for missing", () => {
        expect(provider.getHistory("missing")).toEqual([]);
      });
      it("defensive copies", () => {
        provider.createThread(makeMeta());
        provider.addEntry("t1", makeEntry());
        const h = provider.getHistory("t1");
        h[0].content = "mutated";
        expect(provider.getHistory("t1")[0].content).toBe("hello");
      });
      it("respects limit", () => {
        provider.createThread(makeMeta());
        provider.addEntry("t1", makeEntry({ id: "e1" }));
        provider.addEntry("t1", makeEntry({ id: "e2" }));
        provider.addEntry("t1", makeEntry({ id: "e3" }));
        const r = provider.getHistory("t1", 2);
        expect(r).toHaveLength(2);
        expect(r[0].id).toBe("e2");
        expect(r[1].id).toBe("e3");
      });
      it("limit larger returns all", () => {
        provider.createThread(makeMeta());
        provider.addEntry("t1", makeEntry({ id: "e1" }));
        expect(provider.getHistory("t1", 100)).toHaveLength(1);
      });
    });

    describe("deleteEntry", () => {
      it("removes by id", () => {
        provider.createThread(makeMeta());
        provider.addEntry("t1", makeEntry({ id: "e1" }));
        provider.addEntry("t1", makeEntry({ id: "e2" }));
        provider.deleteEntry("t1", "e1");
        expect(provider.getHistory("t1")).toHaveLength(1);
      });
      it("no-op for missing entry", () => {
        provider.createThread(makeMeta());
        provider.addEntry("t1", makeEntry({ id: "e1" }));
        expect(() => provider.deleteEntry("t1", "missing")).not.toThrow();
        expect(provider.getHistory("t1")).toHaveLength(1);
      });
      it("no-op for missing thread", () => {
        expect(() => provider.deleteThread("missing")).not.toThrow();
      });
    });

    describe("clearHistory", () => {
      it("removes all", () => {
        provider.createThread(makeMeta());
        provider.addEntry("t1", makeEntry({ id: "e1" }));
        provider.addEntry("t1", makeEntry({ id: "e2" }));
        provider.clearHistory("t1");
        expect(provider.getHistory("t1")).toEqual([]);
      });
      it("isolates threads", () => {
        provider.createThread(makeMeta({ threadId: "t1" }));
        provider.createThread(makeMeta({ threadId: "t2" }));
        provider.addEntry("t1", makeEntry({ id: "e1" }));
        provider.addEntry("t2", makeEntry({ id: "e2" }));
        provider.clearHistory("t1");
        expect(provider.getHistory("t2")).toHaveLength(1);
      });
    });

    describe("workingMemory", () => {
      it("empty default", () => {
        provider.createThread(makeMeta());
        expect(provider.getWorkingMemory("t1")).toEqual({});
      });
      it("round-trips", () => {
        provider.createThread(makeMeta());
        provider.setWorkingMemory("t1", { key: "value" });
        expect(provider.getWorkingMemory("t1")).toEqual({ key: "value" });
      });
      it("defensive copy", () => {
        provider.createThread(makeMeta());
        provider.setWorkingMemory("t1", { key: "value" });
        const wm = provider.getWorkingMemory("t1");
        (wm as any).key = "mutated";
        expect(provider.getWorkingMemory("t1").key).toBe("value");
      });
      it("overwrites", () => {
        provider.createThread(makeMeta());
        provider.setWorkingMemory("t1", { a: 1 });
        provider.setWorkingMemory("t1", { b: 2 });
        expect(provider.getWorkingMemory("t1")).toEqual({ b: 2 });
      });
    });

    describe("mergeWorkingMemory", () => {
      it("merges into existing", () => {
        provider.createThread(makeMeta());
        provider.setWorkingMemory("t1", { a: 1, b: 2 });
        provider.mergeWorkingMemory("t1", { b: 3, c: 4 });
        expect(provider.getWorkingMemory("t1")).toEqual({ a: 1, b: 3, c: 4 });
      });
      it("creates if none", () => {
        provider.createThread(makeMeta());
        provider.mergeWorkingMemory("t1", { key: "value" });
        expect(provider.getWorkingMemory("t1")).toEqual({ key: "value" });
      });
    });

    describe("threads", () => {
      it("stores and loads", () => {
        provider.createThread(makeMeta());
        expect(provider.getThread("t1")!.threadId).toBe("t1");
      });
      it("preserves timestamps", () => {
        provider.createThread(makeMeta({ createdAt: 5000, updatedAt: 6000 }));
        expect(provider.getThread("t1")!.createdAt).toBe(5000);
      });
      it("overwrites same id", () => {
        provider.createThread(makeMeta({ name: "First" }));
        provider.createThread(makeMeta({ name: "Second" }));
        expect(provider.getThread("t1")!.name).toBe("Second");
      });
      it("undefined for missing", () => {
        expect(provider.getThread("missing")).toBeUndefined();
      });
      it("defensive copy", () => {
        provider.createThread(makeMeta());
        const l = provider.getThread("t1")!;
        l.name = "mutated";
        expect(provider.getThread("t1")!.name).toBe("Test Thread");
      });
    });

    describe("listThreads", () => {
      it("empty when none", () => {
        expect(provider.listThreads()).toEqual([]);
      });
      it("returns all", () => {
        provider.createThread(makeMeta({ threadId: "t1" }));
        provider.createThread(makeMeta({ threadId: "t2" }));
        expect(provider.listThreads()).toHaveLength(2);
      });
      it("filters by sessionId", () => {
        provider.createThread(makeMeta({ threadId: "t1", sessionId: "s1" }));
        provider.createThread(makeMeta({ threadId: "t2", sessionId: "s2" }));
        provider.createThread(makeMeta({ threadId: "t3", sessionId: "s1" }));
        expect(provider.listThreads("s1")).toHaveLength(2);
      });
      it("defensive copies", () => {
        provider.createThread(makeMeta({ threadId: "t1" }));
        const t = provider.listThreads();
        t[0].name = "mutated";
        expect(provider.listThreads()[0].name).toBe("Test Thread");
      });
    });

    describe("deleteThread", () => {
      it("removes thread", () => {
        provider.createThread(makeMeta());
        provider.deleteThread("t1");
        expect(provider.getThread("t1")).toBeUndefined();
      });
      it("removes history", () => {
        provider.createThread(makeMeta());
        provider.addEntry("t1", makeEntry());
        provider.deleteThread("t1");
        expect(provider.getHistory("t1")).toEqual([]);
      });
      it("removes working memory", () => {
        provider.createThread(makeMeta());
        provider.setWorkingMemory("t1", { key: "value" });
        provider.deleteThread("t1");
        expect(provider.getWorkingMemory("t1")).toEqual({});
      });
      it("no-op for missing", () => {
        expect(() => provider.deleteThread("missing")).not.toThrow();
      });
    });

    describe("cloneThread", () => {
      it("clones with history", () => {
        provider.createThread(makeMeta());
        provider.addEntry("t1", makeEntry({ id: "e1", content: "hello" }));
        const c = provider.cloneThread("t1", { threadId: "t2", name: "Cloned" });
        expect(c).toBeDefined();
        expect(c!.threadId).toBe("t2");
        expect(provider.getHistory("t2")).toHaveLength(1);
      });
      it("clones working memory", () => {
        provider.createThread(makeMeta());
        provider.setWorkingMemory("t1", { key: "value" });
        provider.cloneThread("t1", { threadId: "t2" });
        expect(provider.getWorkingMemory("t2")).toEqual({ key: "value" });
      });
      it("undefined for missing source", () => {
        expect(provider.cloneThread("missing", { threadId: "t2" })).toBeUndefined();
      });
      it("independent clones", () => {
        provider.createThread(makeMeta());
        provider.addEntry("t1", makeEntry({ id: "e1" }));
        provider.cloneThread("t1", { threadId: "t2" });
        provider.addEntry("t2", makeEntry({ id: "e2" }));
        expect(provider.getHistory("t1")).toHaveLength(1);
        expect(provider.getHistory("t2")).toHaveLength(2);
      });
    });
  });
}
