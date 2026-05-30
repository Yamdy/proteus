import { describe, it, expect } from "vitest";
import { MockEmbeddingFunction } from "./embedding.js";

describe("MockEmbeddingFunction", () => {
  it("returns a vector of the requested dimension", async () => {
    const embed = new MockEmbeddingFunction(64);
    const vec = await embed.embed("hello world");
    expect(vec).toHaveLength(64);
  });

  it("defaults to dimension 128", async () => {
    const embed = new MockEmbeddingFunction();
    const vec = await embed.embed("test");
    expect(vec).toHaveLength(128);
  });

  it("is deterministic — same input produces same output", async () => {
    const embed = new MockEmbeddingFunction(32);
    const a = await embed.embed("deterministic");
    const b = await embed.embed("deterministic");
    expect(a).toEqual(b);
  });

  it("produces different vectors for different inputs", async () => {
    const embed = new MockEmbeddingFunction(32);
    const a = await embed.embed("cat");
    const b = await embed.embed("dog");
    expect(a).not.toEqual(b);
  });

  it("returns a unit-length (normalised) vector", async () => {
    const embed = new MockEmbeddingFunction(64);
    const vec = await embed.embed("normalised");
    const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
    expect(norm).toBeCloseTo(1.0, 6);
  });

  it("handles empty string", async () => {
    const embed = new MockEmbeddingFunction(32);
    const vec = await embed.embed("");
    expect(vec).toHaveLength(32);
    // all zeros for empty input is fine; norm will be 0 → returned as-is
  });
});
