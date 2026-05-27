import { describe, it, expect } from "vitest";
import { HandlerEngine, registerBuiltins, BUILTIN_HANDLERS } from "./handler-engine.js";
import type { HandlerFn } from "./handler-engine.js";
import type { HandlerDefinition } from "./index.js";

// --- Helpers ---

function interceptor(
  name: string,
  handler: () => Promise<{ ok: true }>,
  opts?: { events?: string[]; priority?: number },
): HandlerDefinition {
  return {
    name,
    events: opts?.events,
    priority: opts?.priority,
    trust: 1,
    handle: async () => handler(),
  };
}

// --- Tests ---

describe("HandlerEngine", () => {
  // Behavior 1: register interceptor, emit executes it
  it("register() registers an interceptor that executes on emit()", async () => {
    const engine = new HandlerEngine();
    engine.register(interceptor("test", async () => ({ ok: true }), { events: ["turn:end"] }));

    const results = await engine.emit("turn:end");

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({ ok: true });
  });

  // Behavior 2: observe() registers observer, emit executes it
  it("observe() registers an observer that executes on emit()", async () => {
    const engine = new HandlerEngine();
    engine.observe("turn:end", async () => ({ ok: true }));

    const results = await engine.emit("turn:end");

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({ ok: true });
  });

  // Behavior 3: handlers execute in priority order (ascending)
  it("executes handlers in priority order (ascending)", async () => {
    const engine = new HandlerEngine();
    const order: number[] = [];
    engine.register({
      name: "low",
      events: ["turn:end"],
      priority: 200,
      trust: 1,
      handle: async () => { order.push(200); return { ok: true }; },
    });
    engine.register({
      name: "high",
      events: ["turn:end"],
      priority: 50,
      trust: 1,
      handle: async () => { order.push(50); return { ok: true }; },
    });
    engine.register({
      name: "mid",
      events: ["turn:end"],
      priority: 100,
      trust: 1,
      handle: async () => { order.push(100); return { ok: true }; },
    });

    await engine.emit("turn:end");

    expect(order).toEqual([50, 100, 200]);
  });

  // Behavior 4: same priority maintains insertion order
  it("maintains insertion order for handlers with same priority", async () => {
    const engine = new HandlerEngine();
    const order: string[] = [];
    engine.register({
      name: "first",
      events: ["turn:end"],
      priority: 100,
      trust: 1,
      handle: async () => { order.push("first"); return { ok: true }; },
    });
    engine.register({
      name: "second",
      events: ["turn:end"],
      priority: 100,
      trust: 1,
      handle: async () => { order.push("second"); return { ok: true }; },
    });
    engine.register({
      name: "third",
      events: ["turn:end"],
      priority: 100,
      trust: 1,
      handle: async () => { order.push("third"); return { ok: true }; },
    });

    await engine.emit("turn:end");

    expect(order).toEqual(["first", "second", "third"]);
  });

  // Behavior 5: ok:false short-circuits subsequent interceptors
  it("short-circuits subsequent interceptors on ok:false", async () => {
    const engine = new HandlerEngine();
    const order: string[] = [];
    engine.register({
      name: "blocker",
      events: ["turn:end"],
      priority: 50,
      trust: 1,
      handle: async () => { order.push("blocker"); return { ok: false, reason: "blocked" }; },
    });
    engine.register({
      name: "after",
      events: ["turn:end"],
      priority: 100,
      trust: 1,
      handle: async () => { order.push("after"); return { ok: true }; },
    });

    const results = await engine.emit("turn:end");

    expect(order).toEqual(["blocker"]);
    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({ ok: false, reason: "blocked" });
  });

  // Behaviors 6-8: abort, suspend, error(recoverable:false) short-circuit
  it.each([
    ["abort", async () => { return { abort: true, reason: "user abort" }; }],
    ["suspend", async () => { return { suspend: true, pendingInput: "waiting" }; }],
    ["error(non-recoverable)", async () => { return { error: new Error("fatal"), recoverable: false }; }],
  ])("short-circuits on %s", async (_label, handlerFn) => {
    const engine = new HandlerEngine();
    const ran: string[] = [];
    engine.register({
      name: "blocker",
      events: ["turn:end"],
      priority: 50,
      trust: 1,
      handle: async () => { ran.push("blocker"); return handlerFn() as any; },
    });
    engine.register({
      name: "after",
      events: ["turn:end"],
      priority: 100,
      trust: 1,
      handle: async () => { ran.push("after"); return { ok: true }; },
    });

    const results = await engine.emit("turn:end");

    expect(ran).toEqual(["blocker"]);
    expect(results).toHaveLength(1);
  });

  // Behavior 9: observers always execute, not affected by short-circuit
  it("observers always execute even when interceptors short-circuit", async () => {
    const engine = new HandlerEngine();
    const ran: string[] = [];
    engine.register({
      name: "blocker",
      events: ["turn:end"],
      priority: 50,
      trust: 1,
      handle: async () => { ran.push("blocker"); return { ok: false, reason: "blocked" }; },
    });
    engine.observe("turn:end", async () => { ran.push("observer"); return { ok: true }; }, 100, "spy");
    engine.register({
      name: "after",
      events: ["turn:end"],
      priority: 200,
      trust: 1,
      handle: async () => { ran.push("after"); return { ok: true }; },
    });

    const results = await engine.emit("turn:end");

    // blocker runs, observer runs (not skipped), after is skipped
    expect(ran).toEqual(["blocker", "observer"]);
    expect(results).toHaveLength(2);
  });

  // Behavior 10: ok:true / transform / error(recoverable:true) do NOT short-circuit
  it.each([
    ["ok:true", async () => { return { ok: true }; }],
    ["transform", async () => { return { ok: true, value: "transformed", transform: true }; }],
    ["error(recoverable)", async () => { return { error: new Error("retry"), recoverable: true }; }],
  ])("does NOT short-circuit on %s", async (_label, handlerFn) => {
    const engine = new HandlerEngine();
    const ran: string[] = [];
    engine.register({
      name: "first",
      events: ["turn:end"],
      priority: 50,
      trust: 1,
      handle: async () => { ran.push("first"); return handlerFn() as any; },
    });
    engine.register({
      name: "second",
      events: ["turn:end"],
      priority: 100,
      trust: 1,
      handle: async () => { ran.push("second"); return { ok: true }; },
    });

    await engine.emit("turn:end");

    expect(ran).toEqual(["first", "second"]);
  });

  // Behavior 11: builtin interceptors cannot be unregistered or replaced
  it("prevents unregistering a builtin interceptor", () => {
    const engine = new HandlerEngine();
    engine.register({
      name: "checkpoint",
      events: ["turn:end"],
      priority: 10,
      trust: 3,
      builtin: true,
      handle: async () => ({ ok: true }),
    });

    expect(() => engine.unregister("checkpoint")).toThrow(/Cannot unregister built-in/);
  });

  it("prevents replacing a builtin interceptor", () => {
    const engine = new HandlerEngine();
    engine.register({
      name: "checkpoint",
      events: ["turn:end"],
      priority: 10,
      trust: 3,
      builtin: true,
      handle: async () => ({ ok: true }),
    });

    expect(() =>
      engine.replace("checkpoint", {
        name: "checkpoint",
        events: ["turn:end"],
        priority: 10,
        trust: 3,
        handle: async () => ({ ok: false, reason: "blocked" }),
      })
    ).toThrow(/Cannot replace built-in/);
  });

  // Behavior 12: observers cannot be unregistered or replaced
  it("prevents unregistering an observer", () => {
    const engine = new HandlerEngine();
    engine.observe("turn:end", async () => ({ ok: true }), 50, "spy");

    expect(() => engine.unregister("spy")).toThrow(/Cannot unregister observer/);
  });

  it("prevents replacing an observer", () => {
    const engine = new HandlerEngine();
    engine.observe("turn:end", async () => ({ ok: true }), 50, "spy");

    expect(() =>
      engine.replace("spy", {
        name: "spy",
        events: ["turn:end"],
        trust: 1,
        handle: async () => ({ ok: true }),
      })
    ).toThrow(/Cannot replace observer/);
  });

  // Behavior 13: serialize/deserialize preserves kind field
  it("serialize produces JSON-safe snapshot with kind field", () => {
    const engine = new HandlerEngine();
    engine.register({
      name: "interceptor-1",
      events: ["turn:end"],
      priority: 50,
      trust: 1,
      handle: async () => ({ ok: true }),
    });
    engine.observe("turn:end", async () => ({ ok: true }), 100, "observer-1");

    const snapshot = engine.serialize();

    expect(() => JSON.stringify(snapshot)).not.toThrow();
    expect(snapshot.handlers).toHaveLength(2);
    expect(snapshot.handlers.find((h) => h.name === "interceptor-1")?.kind).toBe("interceptor");
    expect(snapshot.handlers.find((h) => h.name === "observer-1")?.kind).toBe("observer");
    expect(snapshot.handlers[0]).not.toHaveProperty("handle");
  });

  it("deserialize restores engine with preserved kind and priority", () => {
    const fn1: HandlerFn = async () => ({ ok: true });
    const fn2: HandlerFn = async () => ({ ok: true });
    const engine = new HandlerEngine();
    engine.register({
      name: "low",
      events: ["turn:end"],
      priority: 200,
      trust: 1,
      handle: fn1,
    });
    engine.register({
      name: "high",
      events: ["turn:end"],
      priority: 50,
      trust: 1,
      handle: fn2,
    });

    const snapshot = engine.serialize();
    const restored = HandlerEngine.deserialize(snapshot, { low: fn1, high: fn2 });

    const handlers = restored.getHandlers("turn:end");
    expect(handlers).toHaveLength(2);
    expect(handlers.map((h) => h.name)).toEqual(["high", "low"]);
  });

  // Behavior 14: re-entrancy guard
  it("throws on re-entrant emit() beyond depth limit", async () => {
    const engine = new HandlerEngine({ maxEmitDepth: 2 });
    engine.register({
      name: "recursive",
      events: ["turn:end"],
      trust: 1,
      handle: async () => {
        await engine.emit("turn:end");
        return { ok: true };
      },
    });

    await expect(engine.emit("turn:end")).rejects.toThrow(/re-entrancy/);
  });

  // Behavior 15: BUILTIN_HANDLERS and registerBuiltins
  describe("registerBuiltins", () => {
    it("registers all built-in handlers", () => {
      const engine = new HandlerEngine();
      registerBuiltins(engine);

      const turnEnd = engine.getHandlers("turn:end");
      expect(turnEnd.some((h) => h.name === "checkpoint")).toBe(true);

      const llmResp = engine.getHandlers("llm:response");
      expect(llmResp.some((h) => h.name === "cost-tracker")).toBe(true);

      const phaseBefore = engine.getHandlers("phase:before");
      expect(phaseBefore.some((h) => h.name === "freeze-guard")).toBe(true);
      expect(phaseBefore.some((h) => h.name === "otel-bridge")).toBe(true);
    });

    it("all built-in handlers have priority 0-90 and trust 3", () => {
      expect(BUILTIN_HANDLERS.length).toBeGreaterThan(0);
      for (const h of BUILTIN_HANDLERS) {
        expect(h.priority).toBeLessThanOrEqual(90);
        expect(h.trust).toBe(3);
        expect(h.builtin).toBe(true);
      }
    });
  });
});
