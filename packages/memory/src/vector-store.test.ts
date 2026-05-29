import { describe, it, expect } from "vitest";
import { VectorMemoryStore } from "./vector-store.js";

describe("VectorMemoryStore", () => {
  it("all methods throw 'not implemented'", async () => {
    const store = new VectorMemoryStore();
    await expect(store.put({ id: "x", content: "", metadata: {}, createdAt: 0, updatedAt: 0 }))
      .rejects.toThrow("not implemented");
    await expect(store.get("x")).rejects.toThrow("not implemented");
    await expect(store.delete("x")).rejects.toThrow("not implemented");
    await expect(store.search({})).rejects.toThrow("not implemented");
    await expect(store.list()).rejects.toThrow("not implemented");
  });
});
