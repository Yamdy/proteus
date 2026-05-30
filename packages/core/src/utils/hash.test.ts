import { describe, it, expect } from "vitest";
import { sha256 } from "./hash.js";

describe("sha256", () => {
  it("returns a 64-character hex string", () => {
    const result = sha256("test");
    expect(result).toHaveLength(64);
    expect(result).toMatch(/^[0-9a-f]{64}$/);
  });

  it("produces deterministic output for the same input", () => {
    expect(sha256("hello")).toBe(sha256("hello"));
  });

  it("produces different output for different inputs", () => {
    expect(sha256("hello")).not.toBe(sha256("world"));
  });

  it("matches known SHA-256 vector for empty string", () => {
    expect(sha256("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });

  it("matches known SHA-256 vector for 'abc'", () => {
    expect(sha256("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("handles unicode input", () => {
    const result = sha256("日本語");
    expect(result).toHaveLength(64);
    expect(result).toMatch(/^[0-9a-f]{64}$/);
  });

  it("handles large input efficiently", () => {
    const start = performance.now();
    sha256("a".repeat(100_000));
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(100);
  });

  it("handles JSON payload (FrozenContext typical use case)", () => {
    const payload = JSON.stringify({
      sessionId: "s1",
      turnId: "t1",
      messages: [],
    });
    const result = sha256(payload);
    expect(result).toHaveLength(64);
    expect(result).toMatch(/^[0-9a-f]{64}$/);
  });
});
