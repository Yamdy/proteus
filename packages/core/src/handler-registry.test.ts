import { describe, it, expect } from "vitest";
import { HandlerRegistry } from "./handler-registry.js";
import type { HandlerDefinition } from "./index.js";

describe("HandlerRegistry", () => {
  it("registers a handler and returns it for matching events", () => {
    const registry = new HandlerRegistry();
    const handler: HandlerDefinition = {
      name: "test-handler",
      events: ["custom:event"],
      trust: 1,
      handle: async () => ({ ok: true }),
    };

    registry.register(handler);

    const handlers = registry.getHandlers("custom:event");
    expect(handlers).toHaveLength(1);
    expect(handlers[0].name).toBe("test-handler");
  });

  it("returns handlers sorted by priority (ascending)", () => {
    const registry = new HandlerRegistry();
    registry.register({
      name: "low-priority",
      events: ["custom:event"],
      priority: 200,
      trust: 1,
      handle: async () => ({ ok: true }),
    });
    registry.register({
      name: "high-priority",
      events: ["custom:event"],
      priority: 50,
      trust: 1,
      handle: async () => ({ ok: true }),
    });
    registry.register({
      name: "medium-priority",
      events: ["custom:event"],
      priority: 100,
      trust: 1,
      handle: async () => ({ ok: true }),
    });

    const handlers = registry.getHandlers("custom:event");

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
      events: ["custom:event"],
      priority: 100,
      trust: 1,
      handle: async () => ({ ok: true }),
    });
    registry.register({
      name: "second",
      events: ["custom:event"],
      priority: 100,
      trust: 1,
      handle: async () => ({ ok: true }),
    });
    registry.register({
      name: "third",
      events: ["custom:event"],
      priority: 100,
      trust: 1,
      handle: async () => ({ ok: true }),
    });

    const handlers = registry.getHandlers("custom:event");

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
      events: ["custom:event"],
      trust: 1,
      handle: async () => ({ ok: true }),
    });
    registry.register({
      name: "to-keep",
      events: ["custom:event"],
      trust: 1,
      handle: async () => ({ ok: true }),
    });

    registry.unregister("to-remove");

    const handlers = registry.getHandlers("custom:event");
    expect(handlers).toHaveLength(1);
    expect(handlers[0].name).toBe("to-keep");
  });

  it("replaces a handler by name", () => {
    const registry = new HandlerRegistry();
    registry.register({
      name: "original",
      events: ["custom:event"],
      priority: 100,
      trust: 1,
      handle: async () => ({ ok: true }),
    });

    registry.replace("original", {
      name: "replacement",
      events: ["custom:event"],
      priority: 50,
      trust: 2,
      handle: async () => ({ ok: true, value: "replaced" }),
    });

    const handlers = registry.getHandlers("custom:event");
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

  describe("built-in handlers auto-registration", () => {
    it("auto-registers checkpoint handler for turn:end at construction", () => {
      const registry = new HandlerRegistry();
      const handlers = registry.getHandlers("turn:end");
      const checkpoint = handlers.find((h) => h.name === "checkpoint");
      expect(checkpoint).toBeDefined();
      expect(checkpoint!.trust).toBe(3);
      expect(checkpoint!.builtin).toBe(true);
      expect(checkpoint!.priority).toBeLessThanOrEqual(90);
    });

    it("auto-registers cost-tracker for llm:response at construction", () => {
      const registry = new HandlerRegistry();
      const handlers = registry.getHandlers("llm:response");
      const costTracker = handlers.find((h) => h.name === "cost-tracker");
      expect(costTracker).toBeDefined();
      expect(costTracker!.trust).toBe(3);
      expect(costTracker!.builtin).toBe(true);
    });

    it("auto-registers otel-bridge for phase events at construction", () => {
      const registry = new HandlerRegistry();
      const before = registry.getHandlers("phase:before");
      const after = registry.getHandlers("phase:after");
      const otel = before
        .concat(after)
        .find((h) => h.name === "otel-bridge");
      expect(otel).toBeDefined();
      expect(otel!.trust).toBe(3);
    });

    it("auto-registers freeze-guard for phase:before at construction", () => {
      const registry = new HandlerRegistry();
      const handlers = registry.getHandlers("phase:before");
      const freezeGuard = handlers.find((h) => h.name === "freeze-guard");
      expect(freezeGuard).toBeDefined();
      expect(freezeGuard!.trust).toBe(3);
      expect(freezeGuard!.priority).toBeLessThanOrEqual(90);
    });
  });

  describe("serialize / deserialize", () => {
    it("serialize returns JSON-safe snapshot of all handler metadata", () => {
      const registry = new HandlerRegistry();
      registry.register({
        name: "test-handler",
        events: ["custom:event"],
        phases: ["action_resolution"],
        priority: 50,
        trust: 2,
        handle: async () => ({ ok: true }),
      });

      const snapshot = registry.serialize();

      expect(() => JSON.stringify(snapshot)).not.toThrow();
      // 4 built-in + 1 user handler
      expect(snapshot.handlers).toHaveLength(5);
      const userHandler = snapshot.handlers.find((h) => h.name === "test-handler");
      expect(userHandler).toEqual({
        name: "test-handler",
        events: ["custom:event"],
        phases: ["action_resolution"],
        priority: 50,
        trust: 2,
        builtin: false,
      });
      // Should NOT contain handle function
      expect(userHandler).not.toHaveProperty("handle");
    });

    it("deserialize rebuilds registry with re-attached handler functions", () => {
      const handlerFn = async () => ({ ok: true });
      const registry = new HandlerRegistry();
      registry.register({
        name: "test-handler",
        events: ["custom:event"],
        priority: 50,
        trust: 2,
        handle: handlerFn,
      });

      const snapshot = registry.serialize();
      const restored = HandlerRegistry.deserialize(snapshot, {
        "test-handler": handlerFn,
      });

      const handlers = restored.getHandlers("custom:event");
      expect(handlers).toHaveLength(1);
      expect(handlers[0].name).toBe("test-handler");
      expect(handlers[0].handle).toBe(handlerFn);
    });

    it("deserialize preserves priority ordering", () => {
      const fn1 = async () => ({ ok: true });
      const fn2 = async () => ({ ok: true });

      const registry = new HandlerRegistry();
      registry.register({
        name: "low",
        events: ["custom:event"],
        priority: 200,
        trust: 1,
        handle: fn1,
      });
      registry.register({
        name: "high",
        events: ["custom:event"],
        priority: 50,
        trust: 1,
        handle: fn2,
      });

      const snapshot = registry.serialize();
      const restored = HandlerRegistry.deserialize(snapshot, {
        low: fn1,
        high: fn2,
      });

      const handlers = restored.getHandlers("custom:event");
      expect(handlers.map((h) => h.name)).toEqual(["high", "low"]);
    });
  });
});
