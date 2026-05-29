import { describe, it, expect, afterEach } from "vitest";
import { WorkerPool } from "./worker-pool.js";
import type { WorkerTask } from "./worker-pool.js";

describe("WorkerPool", () => {
  let pool: WorkerPool | undefined;

  afterEach(async () => {
    if (pool) {
      await pool.shutdown();
      pool = undefined;
    }
  });

  function makeTask(overrides?: Partial<WorkerTask>): WorkerTask {
    return {
      handlerName: overrides?.handlerName ?? "test-handler",
      handlerSource:
        overrides?.handlerSource ?? "async function handle(ctx) { return { ok: true }; }",
      eventName: overrides?.eventName ?? "turn:end",
      contextSnapshot: overrides?.contextSnapshot ?? {},
    };
  }

  // Behavior 1: submit and receive result
  it("submits a task and returns handler result", async () => {
    pool = new WorkerPool({ minWorkers: 1 });
    const task = makeTask();

    const result = await pool.submit(task);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.handlerResult).toEqual({ ok: true });
    }
  });

  // Behavior 2: configurable timeout
  it("returns timeout error when task exceeds timeout", async () => {
    pool = new WorkerPool({ minWorkers: 1, taskTimeoutMs: 100 });
    const task = makeTask({
      handlerSource: `
        async function handle(ctx) {
          await new Promise(r => setTimeout(r, 5000));
          return { ok: true };
        }
      `,
    });

    const result = await pool.submit(task);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/timeout/i);
      expect(result.recoverable).toBe(false);
    }
  });

  // Behavior 3: worker crash returns non-recoverable error
  it("returns non-recoverable error when handler throws", async () => {
    pool = new WorkerPool({ minWorkers: 1 });
    const task = makeTask({
      handlerSource: `
        async function handle(ctx) {
          throw new Error("handler exploded");
        }
      `,
    });

    const result = await pool.submit(task);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/handler exploded/);
      expect(result.recoverable).toBe(false);
    }
  });

  // Behavior 4: graceful shutdown
  it("shuts down cleanly without hanging", async () => {
    pool = new WorkerPool({ minWorkers: 2 });
    await pool.submit(makeTask());

    await expect(pool.shutdown()).resolves.toBeUndefined();
    pool = undefined;
  });

  // Behavior 5: multiple concurrent tasks
  it("handles multiple concurrent tasks", async () => {
    pool = new WorkerPool({ minWorkers: 2 });
    const tasks = Array.from({ length: 5 }, (_, i) =>
      makeTask({
        handlerSource: `
          async function handle(ctx) {
            return { ok: true, value: ${i} };
          }
        `,
      }),
    );

    const results = await Promise.all(tasks.map((t) => pool!.submit(t)));

    expect(results).toHaveLength(5);
    for (const r of results) {
      expect(r.ok).toBe(true);
    }
  });

  // Behavior 6: context snapshot is passed to handler
  it("passes context snapshot to handler", async () => {
    pool = new WorkerPool({ minWorkers: 1 });
    const task = makeTask({
      handlerSource: `
        async function handle(ctx) {
          return { ok: true, value: ctx.sessionId };
        }
      `,
      contextSnapshot: { sessionId: "sess-123" },
    });

    const result = await pool.submit(task);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.handlerResult).toEqual({ ok: true, value: "sess-123" });
    }
  });
});
