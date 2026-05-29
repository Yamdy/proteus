import { describe, it, expect } from "vitest";
import { ProgressiveDisclosure } from "./progressive-disclosure.js";

describe("ProgressiveDisclosure", () => {
  it("register + get loads and returns value", async () => {
    const pd = new ProgressiveDisclosure<string>();
    pd.register("greeting", async () => "hello world");
    const result = await pd.get("greeting");
    expect(result).toBe("hello world");
  });

  it("second get returns cached value without calling loader again", async () => {
    let callCount = 0;
    const pd = new ProgressiveDisclosure<string>();
    pd.register("greeting", async () => { callCount++; return "hello"; });
    await pd.get("greeting");
    await pd.get("greeting");
    expect(callCount).toBe(1);
  });

  it("invalidate clears cache for specific id", async () => {
    let callCount = 0;
    const pd = new ProgressiveDisclosure<string>();
    pd.register("greeting", async () => { callCount++; return `hello-${callCount}`; });
    expect(await pd.get("greeting")).toBe("hello-1");
    pd.invalidate("greeting");
    expect(await pd.get("greeting")).toBe("hello-2");
    expect(callCount).toBe(2);
  });

  it("invalidateAll clears all caches", async () => {
    let countA = 0, countB = 0;
    const pd = new ProgressiveDisclosure<string>();
    pd.register("a", async () => { countA++; return `a-${countA}`; });
    pd.register("b", async () => { countB++; return `b-${countB}`; });
    await pd.get("a");
    await pd.get("b");
    pd.invalidateAll();
    expect(await pd.get("a")).toBe("a-2");
    expect(await pd.get("b")).toBe("b-2");
  });

  it("get for unregistered id throws error", async () => {
    const pd = new ProgressiveDisclosure<string>();
    await expect(pd.get("unknown")).rejects.toThrow(
      'ProgressiveDisclosure: unknown identifier "unknown"',
    );
  });

  it("loader failure does not cache, can retry", async () => {
    let attempts = 0;
    const pd = new ProgressiveDisclosure<string>();
    pd.register("flaky", async () => {
      attempts++;
      if (attempts === 1) throw new Error("boom");
      return "ok";
    });
    await expect(pd.get("flaky")).rejects.toThrow("boom");
    expect(await pd.get("flaky")).toBe("ok");
  });

  it("has returns true for registered, false for unregistered", () => {
    const pd = new ProgressiveDisclosure<string>();
    pd.register("x", async () => "val");
    expect(pd.has("x")).toBe(true);
    expect(pd.has("y")).toBe(false);
  });

  it("list returns all registered identifiers", () => {
    const pd = new ProgressiveDisclosure<string>();
    pd.register("a", async () => "");
    pd.register("b", async () => "");
    pd.register("c", async () => "");
    expect(pd.list().sort()).toEqual(["a", "b", "c"]);
  });
});
