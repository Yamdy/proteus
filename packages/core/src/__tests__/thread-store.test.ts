import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryThreadStore } from "../checkpoint-store.js";
import type { ThreadStore, ThreadMeta } from "../checkpoint-store.js";
import type { LLMMessage } from "../types.js";

// --- Helpers ---

function makeThread(overrides?: Partial<ThreadMeta>): ThreadMeta {
  return {
    threadId: "t1",
    name: "Test Thread",
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides,
  };
}

function makeMsg(role: "user" | "assistant" | "system" | "tool", content: string): LLMMessage {
  return { role, content };
}

// --- Tests ---

describe("InMemoryThreadStore — ThreadStore interface", () => {
  let store: ThreadStore;

  beforeEach(() => {
    store = new InMemoryThreadStore();
  });

  // --- createThread ---

  describe("createThread", () => {
    it("stores a thread that can be loaded by id", () => {
      store.createThread(makeThread());

      const loaded = store.loadThread("t1");
      expect(loaded).toBeDefined();
      expect(loaded!.threadId).toBe("t1");
      expect(loaded!.name).toBe("Test Thread");
    });

    it("preserves explicit createdAt and updatedAt", () => {
      store.createThread(makeThread({ createdAt: 5000, updatedAt: 6000 }));

      const loaded = store.loadThread("t1");
      expect(loaded!.createdAt).toBe(5000);
      expect(loaded!.updatedAt).toBe(6000);
    });

    it("overwrites an existing thread with the same id", () => {
      store.createThread(makeThread({ name: "First" }));
      store.createThread(makeThread({ name: "Second" }));

      const loaded = store.loadThread("t1");
      expect(loaded!.name).toBe("Second");
      expect(store.listThreads()).toHaveLength(1);
    });
  });

  // --- loadThread ---

  describe("loadThread", () => {
    it("returns undefined for a missing threadId", () => {
      expect(store.loadThread("missing")).toBeUndefined();
    });
  });

  // --- updateThread ---

  describe("updateThread", () => {
    it("patches name while preserving other fields", () => {
      store.createThread(makeThread({ createdAt: 1000, updatedAt: 1000 }));
      store.updateThread("t1", { name: "Renamed" });

      const loaded = store.loadThread("t1");
      expect(loaded!.name).toBe("Renamed");
      expect(loaded!.threadId).toBe("t1");
      expect(loaded!.createdAt).toBe(1000);
    });

    it("sets updatedAt to a new timestamp", () => {
      store.createThread(makeThread({ updatedAt: 1000 }));
      store.updateThread("t1", { name: "Updated" });

      const loaded = store.loadThread("t1");
      expect(loaded!.updatedAt).toBeGreaterThanOrEqual(1000);
    });

    it("is a no-op when threadId does not exist", () => {
      expect(() => store.updateThread("missing", { name: "X" })).not.toThrow();
      expect(store.loadThread("missing")).toBeUndefined();
    });
  });

  // --- deleteThread ---

  describe("deleteThread", () => {
    it("removes the thread", () => {
      store.createThread(makeThread());
      store.deleteThread("t1");

      expect(store.loadThread("t1")).toBeUndefined();
      expect(store.listThreads()).toEqual([]);
    });

    it("removes associated messages", () => {
      store.createThread(makeThread());
      store.addThreadMessages("t1", [makeMsg("user", "hello")]);
      store.deleteThread("t1");

      expect(store.loadThreadMessages("t1")).toEqual([]);
    });

    it("is a no-op when threadId does not exist", () => {
      expect(() => store.deleteThread("missing")).not.toThrow();
    });
  });

  // --- listThreads ---

  describe("listThreads", () => {
    it("returns empty array when no threads exist", () => {
      expect(store.listThreads()).toEqual([]);
    });

    it("returns all created threads", () => {
      store.createThread(makeThread({ threadId: "t1", name: "A" }));
      store.createThread(makeThread({ threadId: "t2", name: "B" }));

      const threads = store.listThreads();
      expect(threads).toHaveLength(2);
      expect(threads.map((t) => t.threadId).sort()).toEqual(["t1", "t2"]);
    });

    it("reflects deletions", () => {
      store.createThread(makeThread({ threadId: "t1" }));
      store.createThread(makeThread({ threadId: "t2" }));
      store.deleteThread("t1");

      expect(store.listThreads()).toHaveLength(1);
      expect(store.listThreads()[0].threadId).toBe("t2");
    });
  });

  // --- addThreadMessages / loadThreadMessages ---

  describe("addThreadMessages / loadThreadMessages", () => {
    it("round-trips messages for a thread", () => {
      store.createThread(makeThread());
      const msgs = [makeMsg("user", "hello"), makeMsg("assistant", "hi there")];
      store.addThreadMessages("t1", msgs);

      const loaded = store.loadThreadMessages("t1");
      expect(loaded).toHaveLength(2);
      expect(loaded[0].content).toBe("hello");
      expect(loaded[1].content).toBe("hi there");
    });

    it("appends messages across multiple calls", () => {
      store.createThread(makeThread());
      store.addThreadMessages("t1", [makeMsg("user", "first")]);
      store.addThreadMessages("t1", [makeMsg("assistant", "second")]);

      const loaded = store.loadThreadMessages("t1");
      expect(loaded).toHaveLength(2);
    });

    it("returns empty array for a thread with no messages", () => {
      store.createThread(makeThread());
      expect(store.loadThreadMessages("t1")).toEqual([]);
    });

    it("returns empty array for a missing threadId", () => {
      expect(store.loadThreadMessages("missing")).toEqual([]);
    });

    it("returns a defensive copy (mutation does not affect store)", () => {
      store.createThread(makeThread());
      store.addThreadMessages("t1", [makeMsg("user", "hello")]);

      const loaded = store.loadThreadMessages("t1");
      loaded.push(makeMsg("user", "injected"));

      expect(store.loadThreadMessages("t1")).toHaveLength(1);
    });
  });
});
