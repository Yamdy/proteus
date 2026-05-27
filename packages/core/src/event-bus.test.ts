import { describe, it, expect } from "vitest";
import { EventBus } from "./event-bus.js";

describe("EventBus", () => {
  it("registers a handler and emits an event, collecting the result", async () => {
    const bus = new EventBus();
    bus.on("phase:before", async () => ({ ok: true }));

    const results = await bus.emit("phase:before", {});

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({ ok: true });
  });

  it("executes multiple handlers in priority order (ascending)", async () => {
    const bus = new EventBus();
    const order: number[] = [];

    bus.on("phase:before", async () => { order.push(200); return { ok: true }; }, 200);
    bus.on("phase:before", async () => { order.push(50); return { ok: true }; }, 50);
    bus.on("phase:before", async () => { order.push(100); return { ok: true }; }, 100);

    await bus.emit("phase:before", {});

    expect(order).toEqual([50, 100, 200]);
  });

  it("returns empty array when no handlers registered for event", async () => {
    const bus = new EventBus();
    const results = await bus.emit("nonexistent:event", {});
    expect(results).toEqual([]);
  });

  it("collects results from multiple handlers", async () => {
    const bus = new EventBus();
    bus.on("phase:before", async () => ({ ok: true }));
    bus.on("phase:before", async () => ({ ok: false, reason: "blocked" }));

    const results = await bus.emit("phase:before", {});

    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({ ok: true });
    expect(results[1]).toEqual({ ok: false, reason: "blocked" });
  });

  it("passes payload to handlers", async () => {
    const bus = new EventBus();
    let received: unknown = undefined;
    bus.on("phase:before", async (ctx) => { received = ctx; return { ok: true }; });

    await bus.emit("phase:before", { phaseName: "llm_inference" });

    expect(received).toEqual({ phaseName: "llm_inference" });
  });
});
