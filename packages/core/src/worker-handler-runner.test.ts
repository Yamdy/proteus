import { describe, it, expect, vi } from "vitest";
import { WorkerHandlerRunner, buildContextSnapshot } from "./worker-handler-runner.js";
import type { WorkerPool, WorkerResult } from "./worker-pool.js";
import type { HandlerDefinition } from "./index.js";

function mockPool(result: WorkerResult): WorkerPool {
  return { submit: vi.fn().mockResolvedValue(result), shutdown: vi.fn() } as unknown as WorkerPool;
}

function handler(overrides?: Partial<HandlerDefinition>): HandlerDefinition {
  return {
    name: "test-handler",
    events: ["turn:end"],
    trust: 2,
    handle: async () => ({ ok: true }),
    ...overrides,
  };
}

describe("WorkerHandlerRunner", () => {
  // Behavior 1: submits correct task to pool
  it("submits handler source and context snapshot to pool", async () => {
    const pool = mockPool({ ok: true, handlerResult: { ok: true } });
    const runner = new WorkerHandlerRunner(pool);
    const ctx = { sessionId: "s1", turnId: "t1", messages: [] };

    await runner.run(handler(), ctx);

    expect(pool.submit).toHaveBeenCalledWith(
      expect.objectContaining({
        handlerName: "test-handler",
        handlerSource: expect.any(String),
        eventName: "turn:end",
        contextSnapshot: ctx,
      }),
    );
  });

  // Behavior 2: returns HandlerResult from pool result
  it("returns handler result from successful pool submission", async () => {
    const pool = mockPool({ ok: true, handlerResult: { ok: true, value: 42 } });
    const runner = new WorkerHandlerRunner(pool);

    const result = await runner.run(handler(), {});

    expect(result).toEqual({ ok: true, value: 42 });
  });

  // Behavior 3: returns error HandlerResult on pool failure
  it("returns error HandlerResult when pool returns failure", async () => {
    const pool = mockPool({ ok: false, error: "worker crashed", recoverable: false });
    const runner = new WorkerHandlerRunner(pool);

    const result = await runner.run(handler(), {});

    expect(result).toEqual({ error: { message: "worker crashed" }, recoverable: false });
    if ("error" in result) {
      expect(result.error.message).toBe("worker crashed");
    }
  });

  // Behavior 4: validates returned result with Zod schema
  it("returns validation error when handler result has invalid shape", async () => {
    const pool = mockPool({ ok: true, handlerResult: { invalid: true } });
    const runner = new WorkerHandlerRunner(pool);

    const result = await runner.run(handler(), {});

    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error.message).toMatch(/invalid|validation/i);
      expect(result.recoverable).toBe(false);
    }
  });
});

describe("buildContextSnapshot", () => {
  // Behavior 5: extracts only serializable fields
  it("extracts serializable fields from HandlerContext", () => {
    const ctx = {
      agent: { provider: "openai" },
      session: { sessionId: "s1", config: { model: "gpt-4" } },
      turn: { turnId: "t1", messages: [{ role: "user", content: "hi" }] },
      freeze: () => ({ checksum: "abc" }),
    };

    const snapshot = buildContextSnapshot(ctx);

    expect(snapshot).toEqual({
      agent: { provider: "openai" },
      session: { sessionId: "s1", config: { model: "gpt-4" } },
      turn: { turnId: "t1", messages: [{ role: "user", content: "hi" }] },
    });
    expect(snapshot).not.toHaveProperty("freeze");
  });

  // Behavior 6: handles null/undefined context gracefully
  it("returns empty object for null context", () => {
    expect(buildContextSnapshot(null)).toEqual({});
  });

  it("returns empty object for undefined context", () => {
    expect(buildContextSnapshot(undefined)).toEqual({});
  });

  // Behavior 7: strips function references
  it("strips function references from context", () => {
    const ctx = {
      sessionId: "s1",
      emit: async () => {},
      getHandlers: () => [],
      data: { value: 42 },
    };

    const snapshot = buildContextSnapshot(ctx);

    expect(snapshot).toEqual({ sessionId: "s1", data: { value: 42 } });
    expect(snapshot).not.toHaveProperty("emit");
    expect(snapshot).not.toHaveProperty("getHandlers");
  });
});
