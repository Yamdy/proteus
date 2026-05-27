import { describe, it, expect } from "vitest";
import { HandlerRegistry, registerBuiltins, BUILTIN_HANDLERS } from "./handler-registry.js";

describe("HandlerRegistry", () => {
  it("registers a handler and returns it for matching events", () => {
    const registry = new HandlerRegistry();
    registry.register({
      name: "test-handler",
      events: ["turn:end"],
      trust: 1,
      handle: async () => ({ ok: true }),
    });

    const handlers = registry.getHandlers("turn:end");
    expect(handlers).toHaveLength(1);
    expect(handlers[0].name).toBe("test-handler");
  });

  it("returns handlers sorted by priority (ascending)", () => {
    const registry = new HandlerRegistry();
    registry.register({
      name: "low-priority",
      events: ["turn:end"],
      priority: 200,
      trust: 1,
      handle: async () => ({ ok: true }),
    });
    registry.register({
      name: "high-priority",
      events: ["turn:end"],
      priority: 50,
      trust: 1,
      handle: async () => ({ ok: true }),
    });
    registry.register({
      name: "medium-priority",
      events: ["turn:end"],
      priority: 100,
      trust: 1,
      handle: async () => ({ ok: true }),
    });

    const handlers = registry.getHandlers("turn:end");

    expect(handlers.map((h) => h.name)).toEqual([
      "high-priority",
      "medium-priority",
      "low-priority",
    ]);
  });

  it("maintains insertion order for handlers with same priority", () => {
    const registry = new HandlerRegistry();
    registry.register({
      name: "first",
      events: ["turn:end"],
      priority: 100,
      trust: 1,
      handle: async () => ({ ok: true }),
    });
    registry.register({
      name: "second",
      events: ["turn:end"],
      priority: 100,
      trust: 1,
      handle: async () => ({ ok: true }),
    });
    registry.register({
      name: "third",
      events: ["turn:end"],
      priority: 100,
      trust: 1,
      handle: async () => ({ ok: true }),
    });

    const handlers = registry.getHandlers("turn:end");

    expect(handlers.map((h) => h.name)).toEqual([
      "first",
      "second",
      "third",
    ]);
  });

  it("unregisters a handler by name", () => {
    const registry = new HandlerRegistry();
    registry.register({
      name: "to-remove",
      events: ["turn:end"],
      trust: 1,
      handle: async () => ({ ok: true }),
    });
    registry.register({
      name: "to-keep",
      events: ["turn:end"],
      trust: 1,
      handle: async () => ({ ok: true }),
    });

    registry.unregister("to-remove");

    const handlers = registry.getHandlers("turn:end");
    expect(handlers).toHaveLength(1);
    expect(handlers[0].name).toBe("to-keep");
  });

  it("replaces a handler by name", () => {
    const registry = new HandlerRegistry();
    registry.register({
      name: "original",
      events: ["turn:end"],
      priority: 100,
      trust: 1,
      handle: async () => ({ ok: true }),
    });

    registry.replace("original", {
      name: "replacement",
      events: ["turn:end"],
      priority: 50,
      trust: 2,
      handle: async () => ({ ok: true, value: "replaced" }),
    });

    const handlers = registry.getHandlers("turn:end");
    expect(handlers).toHaveLength(1);
    expect(handlers[0].name).toBe("replacement");
    expect(handlers[0].priority).toBe(50);
  });

  describe("built-in handler protection", () => {
    it("prevents unregistering a built-in handler", () => {
      const registry = new HandlerRegistry();
      registry.register({
        name: "checkpoint",
        events: ["turn:end"],
        priority: 10,
        trust: 3,
        handle: async () => ({ ok: true }),
        builtin: true,
      });

      expect(() => registry.unregister("checkpoint")).toThrow(
        /Cannot unregister built-in handler/
      );
    });

    it("prevents replacing a built-in handler", () => {
      const registry = new HandlerRegistry();
      registry.register({
        name: "checkpoint",
        events: ["turn:end"],
        priority: 10,
        trust: 3,
        handle: async () => ({ ok: true }),
        builtin: true,
      });

      expect(() =>
        registry.replace("checkpoint", {
          name: "checkpoint",
          events: ["turn:end"],
          priority: 10,
          trust: 3,
          handle: async () => ({ ok: false, reason: "blocked" }),
        })
      ).toThrow(/Cannot replace built-in handler/);
    });

    it("allows unregistering non-built-in handlers", () => {
      const registry = new HandlerRegistry();
      registry.register({
        name: "user-handler",
        events: ["turn:end"],
        trust: 1,
        handle: async () => ({ ok: true }),
      });

      expect(() => registry.unregister("user-handler")).not.toThrow();
    });
  });

  describe("registerBuiltins", () => {
    it("registers all built-in handlers", () => {
      const registry = new HandlerRegistry();
      registerBuiltins(registry);

      const turnEnd = registry.getHandlers("turn:end");
      expect(turnEnd.some((h) => h.name === "checkpoint")).toBe(true);

      const llmResp = registry.getHandlers("llm:response");
      expect(llmResp.some((h) => h.name === "cost-tracker")).toBe(true);

      const phaseBefore = registry.getHandlers("phase:before");
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

  describe("serialize / deserialize", () => {
    it("serialize returns JSON-safe snapshot of handler metadata", () => {
      const registry = new HandlerRegistry();
      registry.register({
        name: "test-handler",
        events: ["turn:end"],
        phases: ["action_resolution"],
        priority: 50,
        trust: 2,
        handle: async () => ({ ok: true }),
      });

      const snapshot = registry.serialize();

      expect(() => JSON.stringify(snapshot)).not.toThrow();
      expect(snapshot.handlers).toHaveLength(1);
      expect(snapshot.handlers[0]).toEqual({
        name: "test-handler",
        events: ["turn:end"],
        phases: ["action_resolution"],
        priority: 50,
        trust: 2,
        builtin: false,
      });
      expect(snapshot.handlers[0]).not.toHaveProperty("handle");
    });

    it("deserialize rebuilds registry with re-attached handler functions", () => {
      const handlerFn = async () => ({ ok: true as const });
      const registry = new HandlerRegistry();
      registry.register({
        name: "test-handler",
        events: ["turn:end"],
        priority: 50,
        trust: 2,
        handle: handlerFn,
      });

      const snapshot = registry.serialize();
      const restored = HandlerRegistry.deserialize(snapshot, {
        "test-handler": handlerFn,
      });

      const handlers = restored.getHandlers("turn:end");
      expect(handlers).toHaveLength(1);
      expect(handlers[0].name).toBe("test-handler");
      expect(handlers[0].handle).toBe(handlerFn);
    });

    it("deserialize preserves priority ordering", () => {
      const fn1 = async () => ({ ok: true as const });
      const fn2 = async () => ({ ok: true as const });

      const registry = new HandlerRegistry();
      registry.register({
        name: "low",
        events: ["turn:end"],
        priority: 200,
        trust: 1,
        handle: fn1,
      });
      registry.register({
        name: "high",
        events: ["turn:end"],
        priority: 50,
        trust: 1,
        handle: fn2,
      });

      const snapshot = registry.serialize();
      const restored = HandlerRegistry.deserialize(snapshot, {
        low: fn1,
        high: fn2,
      });

      const handlers = restored.getHandlers("turn:end");
      expect(handlers.map((h) => h.name)).toEqual(["high", "low"]);
    });
  });
});
