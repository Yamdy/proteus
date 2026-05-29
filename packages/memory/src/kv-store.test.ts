import { describe, it, expect } from "vitest";
import { KvMemoryStore } from "./kv-store.js";
import type { MemoryEntry } from "./types.js";

function makeEntry(overrides?: Partial<MemoryEntry>): MemoryEntry {
  return {
    id: "entry-1",
    content: "hello world",
    metadata: { topic: "greeting" },
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides,
  };
}

describe("KvMemoryStore", () => {
  it("put stores an entry, get retrieves it", async () => {
    const store = new KvMemoryStore();
    const entry = makeEntry();
    await store.put(entry);
    const retrieved = await store.get("entry-1");
    expect(retrieved).toEqual(entry);
  });

  it("get returns undefined for missing key", async () => {
    const store = new KvMemoryStore();
    const result = await store.get("nonexistent");
    expect(result).toBeUndefined();
  });

  it("delete removes an entry", async () => {
    const store = new KvMemoryStore();
    await store.put(makeEntry());
    await store.delete("entry-1");
    expect(await store.get("entry-1")).toBeUndefined();
  });

  it("list returns all entries", async () => {
    const store = new KvMemoryStore();
    await store.put(makeEntry({ id: "a" }));
    await store.put(makeEntry({ id: "b" }));
    await store.put(makeEntry({ id: "c" }));
    const all = await store.list();
    expect(all).toHaveLength(3);
    expect(all.map((e) => e.id).sort()).toEqual(["a", "b", "c"]);
  });

  it("search filters by metadata", async () => {
    const store = new KvMemoryStore();
    await store.put(makeEntry({ id: "a", metadata: { topic: "greeting" } }));
    await store.put(makeEntry({ id: "b", metadata: { topic: "farewell" } }));
    await store.put(makeEntry({ id: "c", metadata: { topic: "greeting" } }));
    const results = await store.search({ filter: { topic: "greeting" } });
    expect(results).toHaveLength(2);
    expect(results.map((e) => e.id).sort()).toEqual(["a", "c"]);
  });
});
