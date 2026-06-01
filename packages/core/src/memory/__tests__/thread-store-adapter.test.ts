import { describe, it, expect, beforeEach } from "vitest";
import { ThreadStoreAdapter } from "../thread-store-adapter.js";
import { InMemoryProvider } from "../in-memory-provider.js";
import type { MemoryProvider } from "../types.js";

describe("ThreadStoreAdapter", () => {
  let provider: MemoryProvider;
  let adapter: ThreadStoreAdapter;

  beforeEach(() => {
    provider = new InMemoryProvider();
    adapter = new ThreadStoreAdapter(provider);
  });

  it("createThread / loadThread round-trips through provider", () => {
    adapter.createThread({ threadId: "t1", name: "Thread 1", createdAt: 100, updatedAt: 200 });
    const loaded = adapter.loadThread("t1");
    expect(loaded).toBeDefined();
    expect(loaded!.name).toBe("Thread 1");
  });

  it("updateThread patches through provider", () => {
    adapter.createThread({ threadId: "t1", name: "Original", createdAt: 100, updatedAt: 200 });
    adapter.updateThread("t1", { name: "Updated" });
    expect(adapter.loadThread("t1")!.name).toBe("Updated");
  });

  it("deleteThread removes through provider", () => {
    adapter.createThread({ threadId: "t1", name: "T", createdAt: 1, updatedAt: 1 });
    adapter.deleteThread("t1");
    expect(adapter.loadThread("t1")).toBeUndefined();
  });

  it("listThreads returns all threads from provider", () => {
    adapter.createThread({ threadId: "t1", name: "A", createdAt: 1, updatedAt: 1 });
    adapter.createThread({ threadId: "t2", name: "B", createdAt: 1, updatedAt: 1 });
    expect(adapter.listThreads()).toHaveLength(2);
  });

  it("addThreadMessages / loadThreadMessages round-trips through provider", () => {
    adapter.createThread({ threadId: "t1", name: "T", createdAt: 1, updatedAt: 1 });
    adapter.addThreadMessages("t1", [{ role: "user", content: "hello" }]);
    adapter.addThreadMessages("t1", [{ role: "assistant", content: "hi" }]);
    const msgs = adapter.loadThreadMessages("t1");
    expect(msgs).toHaveLength(2);
    expect(msgs[0].content).toBe("hello");
    expect(msgs[1].content).toBe("hi");
  });

  it("loadThreadMessages returns empty array for missing thread", () => {
    expect(adapter.loadThreadMessages("missing")).toEqual([]);
  });
});
