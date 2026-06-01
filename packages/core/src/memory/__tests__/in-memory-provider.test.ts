import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryProvider, createInMemoryProvider } from "../in-memory-provider.js";
import { runConformanceTests } from "./memory-provider.conformance.js";
import type { MemoryProvider } from "../types.js";

runConformanceTests(() => new InMemoryProvider());

describe("createInMemoryProvider (bindMethods)", () => {
  let provider: MemoryProvider;
  beforeEach(() => { provider = createInMemoryProvider(); });

  it("returns a working provider", () => {
    provider.createThread({ threadId: "t1", sessionId: "s1", name: "Test", createdAt: 1000, updatedAt: 1000 });
    provider.addEntry("t1", { id: "e1", role: "user", content: "hello", timestamp: 1000 });
    const h = provider.getHistory("t1");
    expect(h).toHaveLength(1);
    expect(h[0].content).toBe("hello");
  });

  it("methods are bound", () => {
    const { createThread, addEntry, getHistory } = provider;
    createThread({ threadId: "t1", sessionId: "s1", name: "Test", createdAt: 1000, updatedAt: 1000 });
    addEntry("t1", { id: "e1", role: "user", content: "hello", timestamp: 1000 });
    expect(getHistory("t1")).toHaveLength(1);
  });
});
