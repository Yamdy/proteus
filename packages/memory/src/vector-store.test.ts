import { describe, it, expect } from "vitest";
import { VectorMemoryStore, cosineSimilarity } from "./vector-store.js";
import { MockEmbeddingFunction } from "./embedding.js";
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

describe("cosineSimilarity", () => {
  it("returns 1 for identical vectors", () => {
    expect(cosineSimilarity([1, 0, 0], [1, 0, 0])).toBeCloseTo(1);
  });

  it("returns 0 for orthogonal vectors", () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });

  it("returns -1 for opposite vectors", () => {
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1);
  });

  it("returns 0 for zero-length vector", () => {
    expect(cosineSimilarity([0, 0], [1, 2])).toBe(0);
  });

  it("returns 0 for empty vectors", () => {
    expect(cosineSimilarity([], [])).toBe(0);
  });

  it("computes correct similarity for non-trivial vectors", () => {
    // [1,2,3] . [4,5,6] = 32, |a|=sqrt(14), |b|=sqrt(77)
    const expected = 32 / (Math.sqrt(14) * Math.sqrt(77));
    expect(cosineSimilarity([1, 2, 3], [4, 5, 6])).toBeCloseTo(expected);
  });
});

describe("VectorMemoryStore", () => {
  it("put stores an entry, get retrieves it", async () => {
    const store = new VectorMemoryStore();
    const entry = makeEntry();
    await store.put(entry);
    const retrieved = await store.get("entry-1");
    expect(retrieved).toEqual(entry);
  });

  it("put stores entry with embedding", async () => {
    const store = new VectorMemoryStore();
    const entry = makeEntry();
    await store.put(entry, [0.1, 0.2, 0.3]);
    const retrieved = await store.get("entry-1");
    expect(retrieved).toEqual(entry);
  });

  it("get returns undefined for missing key", async () => {
    const store = new VectorMemoryStore();
    const result = await store.get("nonexistent");
    expect(result).toBeUndefined();
  });

  it("delete removes an entry", async () => {
    const store = new VectorMemoryStore();
    await store.put(makeEntry());
    await store.delete("entry-1");
    expect(await store.get("entry-1")).toBeUndefined();
  });

  it("list returns all entries", async () => {
    const store = new VectorMemoryStore();
    await store.put(makeEntry({ id: "a" }));
    await store.put(makeEntry({ id: "b" }));
    await store.put(makeEntry({ id: "c" }));
    const all = await store.list();
    expect(all).toHaveLength(3);
    expect(all.map((e) => e.id).sort()).toEqual(["a", "b", "c"]);
  });

  it("search filters by metadata without embedding", async () => {
    const store = new VectorMemoryStore();
    await store.put(makeEntry({ id: "a", metadata: { topic: "greeting" } }));
    await store.put(makeEntry({ id: "b", metadata: { topic: "farewell" } }));
    await store.put(makeEntry({ id: "c", metadata: { topic: "greeting" } }));
    const results = await store.search({ filter: { topic: "greeting" } });
    expect(results).toHaveLength(2);
    expect(results.map((e) => e.id).sort()).toEqual(["a", "c"]);
  });

  it("search ranks by cosine similarity (top-K)", async () => {
    const store = new VectorMemoryStore();
    await store.put(makeEntry({ id: "a" }), [1, 0, 0]);
    await store.put(makeEntry({ id: "b" }), [0, 1, 0]);
    await store.put(makeEntry({ id: "c" }), [0.9, 0.1, 0]);

    // query vector closest to "a" and "c"
    const results = await store.search({
      embedding: [1, 0, 0],
      limit: 2,
    });
    expect(results).toHaveLength(2);
    expect(results[0]!.id).toBe("a");
    expect(results[1]!.id).toBe("c");
  });

  it("search combines metadata filter and vector similarity", async () => {
    const store = new VectorMemoryStore();
    await store.put(
      makeEntry({ id: "a", metadata: { topic: "greeting" } }),
      [1, 0, 0],
    );
    await store.put(
      makeEntry({ id: "b", metadata: { topic: "farewell" } }),
      [0, 0, 1],
    );
    await store.put(
      makeEntry({ id: "c", metadata: { topic: "greeting" } }),
      [0.9, 0.1, 0],
    );

    const results = await store.search({
      filter: { topic: "greeting" },
      embedding: [1, 0, 0],
    });
    expect(results).toHaveLength(2);
    expect(results[0]!.id).toBe("a");
    expect(results[1]!.id).toBe("c");
  });

  it("search with embedding excludes entries that have no embedding", async () => {
    const store = new VectorMemoryStore();
    await store.put(makeEntry({ id: "a" }), [1, 0]);
    await store.put(makeEntry({ id: "b" })); // no embedding
    const results = await store.search({ embedding: [1, 0] });
    expect(results).toHaveLength(1);
    expect(results[0]!.id).toBe("a");
  });

  it("search respects offset and limit", async () => {
    const store = new VectorMemoryStore();
    await store.put(makeEntry({ id: "a", metadata: { topic: "x" } }));
    await store.put(makeEntry({ id: "b", metadata: { topic: "x" } }));
    await store.put(makeEntry({ id: "c", metadata: { topic: "x" } }));

    const page = await store.search({ filter: { topic: "x" }, offset: 1, limit: 1 });
    expect(page).toHaveLength(1);
    expect(page[0]!.id).toBe("b");
  });

  it("put overwrites an existing entry", async () => {
    const store = new VectorMemoryStore();
    await store.put(makeEntry({ id: "a", content: "v1" }), [1, 0]);
    await store.put(makeEntry({ id: "a", content: "v2" }), [0, 1]);
    const retrieved = await store.get("a");
    expect(retrieved!.content).toBe("v2");

    // embedding was also overwritten
    const results = await store.search({ embedding: [0, 1] });
    expect(results).toHaveLength(1);
    expect(results[0]!.id).toBe("a");
  });

  it("get / list return defensive copies", async () => {
    const store = new VectorMemoryStore();
    await store.put(makeEntry());

    const a = await store.get("entry-1");
    a!.content = "mutated";
    const b = await store.get("entry-1");
    expect(b!.content).toBe("hello world");

    const list = await store.list();
    list[0]!.content = "mutated";
    const list2 = await store.list();
    expect(list2[0]!.content).toBe("hello world");
  });

  it("save/load round-trips entries and embeddings", async () => {
    const store = new VectorMemoryStore();
    await store.put(makeEntry({ id: "a" }), [1, 2, 3]);
    await store.put(makeEntry({ id: "b", metadata: { topic: "farewell" } }));

    const json = store.save();

    const store2 = new VectorMemoryStore();
    store2.load(json);

    expect(await store2.get("a")).toEqual(makeEntry({ id: "a" }));
    expect(await store2.get("b")).toEqual(
      makeEntry({ id: "b", metadata: { topic: "farewell" } }),
    );
    expect(await store2.list()).toHaveLength(2);

    // embedding for "a" survived the round-trip
    const results = await store2.search({ embedding: [1, 0, 0] });
    expect(results).toHaveLength(1);
    expect(results[0]!.id).toBe("a");

    // "b" had no embedding, so it's excluded from vector search
    const results2 = await store2.search({ embedding: [0, 1, 0] });
    expect(results2).toHaveLength(1);
  });

  it("load replaces existing contents", async () => {
    const store = new VectorMemoryStore();
    await store.put(makeEntry({ id: "old" }));

    const other = new VectorMemoryStore();
    await other.put(makeEntry({ id: "new" }));
    store.load(other.save());

    expect(await store.get("old")).toBeUndefined();
    expect(await store.get("new")).toBeDefined();
  });

  it("empty store returns empty results", async () => {
    const store = new VectorMemoryStore();
    expect(await store.list()).toEqual([]);
    expect(await store.search({})).toEqual([]);
    expect(await store.search({ embedding: [1, 0] })).toEqual([]);
    expect(await store.get("x")).toBeUndefined();
  });

  it("save returns valid JSON with empty store", () => {
    const store = new VectorMemoryStore();
    const json = store.save();
    expect(JSON.parse(json)).toEqual([]);
  });
});

describe("VectorMemoryStore.consolidate", () => {
  it("returns empty result on empty store", async () => {
    const store = new VectorMemoryStore();
    const result = await store.consolidate();
    expect(result.removed).toEqual([]);
    expect(result.merged).toEqual([]);
  });

  it("does nothing when no entries have embeddings", async () => {
    const store = new VectorMemoryStore();
    await store.put(makeEntry({ id: "a" }));
    await store.put(makeEntry({ id: "b" }));
    const result = await store.consolidate();
    expect(result.removed).toEqual([]);
    expect(result.merged).toEqual([]);
    expect(await store.list()).toHaveLength(2);
  });

  it("does nothing when all embeddings are dissimilar", async () => {
    const store = new VectorMemoryStore();
    await store.put(makeEntry({ id: "a" }), [1, 0, 0]);
    await store.put(makeEntry({ id: "b" }), [0, 1, 0]);
    await store.put(makeEntry({ id: "c" }), [0, 0, 1]);
    const result = await store.consolidate();
    expect(result.removed).toEqual([]);
    expect(result.merged).toEqual([]);
    expect(await store.list()).toHaveLength(3);
  });

  it("merges two similar entries, keeping higher importance", async () => {
    const store = new VectorMemoryStore();
    await store.put(
      makeEntry({ id: "a", importance: 0.3, metadata: { topic: "x", source: "a" } }),
      [1, 0, 0],
    );
    await store.put(
      makeEntry({ id: "b", importance: 0.9, metadata: { topic: "x", origin: "b" } }),
      [0.99, 0.1, 0],
    );

    const result = await store.consolidate(0.95);
    expect(result.removed).toHaveLength(1);
    expect(result.removed[0]!.id).toBe("a");
    expect(result.merged).toHaveLength(1);
    expect(result.merged[0]!.id).toBe("b");

    // survivor has merged metadata (victim's "source" key added)
    const survivor = await store.get("b");
    expect(survivor!.metadata).toEqual({ topic: "x", source: "a", origin: "b" });
    expect(survivor!.importance).toBe(0.9);

    // victim is deleted
    expect(await store.get("a")).toBeUndefined();
    expect(await store.list()).toHaveLength(1);
  });

  it("survivor's metadata takes precedence over victim's on key conflict", async () => {
    const store = new VectorMemoryStore();
    await store.put(
      makeEntry({ id: "a", importance: 0.5, metadata: { topic: "override", extra: "yes" } }),
      [1, 0, 0],
    );
    await store.put(
      makeEntry({ id: "b", importance: 0.8, metadata: { topic: "keep" } }),
      [1, 0, 0],
    );

    const result = await store.consolidate(0.95);
    expect(result.removed).toHaveLength(1);
    expect(result.removed[0]!.id).toBe("a");

    const survivor = await store.get("b");
    expect(survivor!.metadata).toEqual({ topic: "keep", extra: "yes" });
  });

  it("falls back to updatedAt tiebreaker when importance is equal", async () => {
    const store = new VectorMemoryStore();
    await store.put(
      makeEntry({ id: "a", importance: 0.5, updatedAt: 2000 }),
      [1, 0, 0],
    );
    await store.put(
      makeEntry({ id: "b", importance: 0.5, updatedAt: 5000 }),
      [1, 0, 0],
    );

    const result = await store.consolidate(0.95);
    expect(result.removed).toHaveLength(1);
    expect(result.removed[0]!.id).toBe("a");
    expect(result.merged[0]!.id).toBe("b");
  });

  it("handles a cluster of three similar entries", async () => {
    const store = new VectorMemoryStore();
    await store.put(
      makeEntry({ id: "a", importance: 0.2, metadata: { from: "a", extraA: 1 } }),
      [1, 0, 0],
    );
    await store.put(
      makeEntry({ id: "b", importance: 0.7, metadata: { from: "b" } }),
      [0.99, 0.1, 0],
    );
    await store.put(
      makeEntry({ id: "c", importance: 0.5, metadata: { from: "c", extraC: 3 } }),
      [0.98, 0.15, 0.05],
    );

    const result = await store.consolidate(0.95);
    // all three are similar; highest importance is b
    expect(result.removed.length).toBeGreaterThanOrEqual(2);
    expect(result.merged).toHaveLength(1);
    expect(result.merged[0]!.id).toBe("b");

    const survivor = await store.get("b");
    // survivor keeps its own "from" key; victim-only keys are merged in
    expect(survivor!.metadata["from"]).toBe("b");
    expect(survivor!.metadata["extraA"]).toBe(1);
    expect(survivor!.metadata["extraC"]).toBe(3);
    expect(await store.list()).toHaveLength(1);
  });

  it("skips entries without embedding", async () => {
    const store = new VectorMemoryStore();
    await store.put(makeEntry({ id: "a" })); // no embedding
    await store.put(makeEntry({ id: "b" }), [1, 0]);
    await store.put(makeEntry({ id: "c" }), [1, 0]);

    const result = await store.consolidate(0.95);
    // only b and c are considered; a is skipped
    expect(result.removed).toHaveLength(1);
    expect(result.merged).toHaveLength(1);
    expect(await store.get("a")).toBeDefined(); // untouched
  });

  it("respects custom threshold", async () => {
    const store = new VectorMemoryStore();
    await store.put(makeEntry({ id: "a" }), [1, 0, 0]);
    await store.put(makeEntry({ id: "b" }), [0.9, 0.1, 0]);
    // cosine ~ 0.995 at default 0.95 threshold: merges
    const high = await store.consolidate(0.95);
    expect(high.removed).toHaveLength(1);

    // With a stricter threshold they should NOT merge
    const store2 = new VectorMemoryStore();
    await store2.put(makeEntry({ id: "a" }), [1, 0, 0]);
    await store2.put(makeEntry({ id: "b" }), [0.6, 0.8, 0]);
    // cosine ≈ 0.6 — below 0.95
    const strict = await store2.consolidate(0.95);
    expect(strict.removed).toEqual([]);
  });

  it("updatedSurvivor gets a new updatedAt timestamp", async () => {
    const store = new VectorMemoryStore();
    const before = Date.now();
    await store.put(
      makeEntry({ id: "a", importance: 0.1, updatedAt: 1000 }),
      [1, 0],
    );
    await store.put(
      makeEntry({ id: "b", importance: 0.5, updatedAt: 2000 }),
      [1, 0],
    );

    await store.consolidate(0.95);
    const survivor = await store.get("b");
    expect(survivor!.updatedAt).toBeGreaterThanOrEqual(before);
  });

  it("multiple independent clusters are merged separately", async () => {
    const store = new VectorMemoryStore();
    // cluster 1: similar to [1,0,0,0]
    await store.put(
      makeEntry({ id: "a1", importance: 0.2, metadata: { cluster: "1a" } }),
      [1, 0, 0, 0],
    );
    await store.put(
      makeEntry({ id: "a2", importance: 0.8, metadata: { cluster: "1b" } }),
      [1, 0, 0, 0],
    );
    // cluster 2: similar to [0,0,0,1]
    await store.put(
      makeEntry({ id: "b1", importance: 0.4, metadata: { cluster: "2a" } }),
      [0, 0, 0, 1],
    );
    await store.put(
      makeEntry({ id: "b2", importance: 0.6, metadata: { cluster: "2b" } }),
      [0, 0, 0, 1],
    );

    const result = await store.consolidate(0.95);
    expect(result.removed).toHaveLength(2);
    expect(result.merged).toHaveLength(2);
    expect(await store.list()).toHaveLength(2);

    // each cluster's survivor is the one with higher importance
    expect(await store.get("a2")).toBeDefined();
    expect(await store.get("b2")).toBeDefined();
  });
});

describe("VectorMemoryStore with EmbeddingFunction", () => {
  const embedFn = new MockEmbeddingFunction(32);
  const embed = (text: string) => embedFn.embed(text);

  it("put auto-embeds entry.content when embeddingFn is provided", async () => {
    const store = new VectorMemoryStore(embed);
    await store.put(makeEntry({ id: "a", content: "hello world" }));

    // search by text should find it
    const results = await store.search({ text: "hello world" });
    expect(results).toHaveLength(1);
    expect(results[0]!.id).toBe("a");
  });

  it("explicit embedding overrides auto-embed on put", async () => {
    const store = new VectorMemoryStore(embed);
    await store.put(makeEntry({ id: "a", content: "hello" }), [1, 0, 0]);

    // the stored vector is the explicit one, not the auto-embedded one
    const results = await store.search({ embedding: [1, 0, 0] });
    expect(results).toHaveLength(1);
    expect(results[0]!.id).toBe("a");
  });

  it("search auto-embeds query.text", async () => {
    const store = new VectorMemoryStore(embed);
    await store.put(makeEntry({ id: "a", content: "machine learning" }));
    await store.put(makeEntry({ id: "b", content: "cooking recipes" }));

    const results = await store.search({ text: "machine learning" });
    expect(results).toHaveLength(2);
    // the entry with identical content should rank first
    expect(results[0]!.id).toBe("a");
  });

  it("search with text and metadata filter combined", async () => {
    const store = new VectorMemoryStore(embed);
    await store.put(makeEntry({ id: "a", content: "cats", metadata: { topic: "animals" } }));
    await store.put(makeEntry({ id: "b", content: "cats", metadata: { topic: "tech" } }));
    await store.put(makeEntry({ id: "c", content: "dogs", metadata: { topic: "animals" } }));

    const results = await store.search({
      text: "cats",
      filter: { topic: "animals" },
    });
    expect(results).toHaveLength(2);
    expect(results[0]!.id).toBe("a"); // same content, matching filter
  });

  it("search with text respects limit", async () => {
    const store = new VectorMemoryStore(embed);
    await store.put(makeEntry({ id: "a", content: "alpha" }));
    await store.put(makeEntry({ id: "b", content: "beta" }));
    await store.put(makeEntry({ id: "c", content: "gamma" }));

    const results = await store.search({ text: "alpha", limit: 1 });
    expect(results).toHaveLength(1);
    expect(results[0]!.id).toBe("a");
  });

  it("explicit embedding in query takes precedence over text", async () => {
    const store = new VectorMemoryStore(embed);
    await store.put(makeEntry({ id: "a", content: "hello" }), [1, 0, 0]);
    await store.put(makeEntry({ id: "b", content: "world" }), [0, 1, 0]);

    // even though text is provided, the explicit embedding is used
    const results = await store.search({
      text: "world",
      embedding: [1, 0, 0],
    });
    expect(results[0]!.id).toBe("a"); // closest to [1,0,0]
  });

  it("deterministic — same content produces same embedding", async () => {
    const store1 = new VectorMemoryStore(embed);
    const store2 = new VectorMemoryStore(embed);

    await store1.put(makeEntry({ id: "a", content: "deterministic" }));
    await store2.put(makeEntry({ id: "a", content: "deterministic" }));

    const json1 = store1.save();
    const json2 = store2.save();
    expect(json1).toBe(json2);
  });

  it("constructor without embeddingFn still works as before", async () => {
    const store = new VectorMemoryStore();
    await store.put(makeEntry({ id: "a" }), [1, 0, 0]);
    await store.put(makeEntry({ id: "b" }), [0, 1, 0]);

    const results = await store.search({ embedding: [1, 0, 0] });
    expect(results[0]!.id).toBe("a");
  });
});
