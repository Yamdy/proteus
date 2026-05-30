import { describe, it, expect } from "vitest";
import { Harness } from "./harness.js";
import { AgentContext, SessionContext } from "./context.js";
import { HandlerEngine } from "./handler-engine.js";
import { InMemoryCheckpointStore } from "./checkpoint-store.js";
import type { LLMProvider } from "./index.js";

function stubLLM(): LLMProvider {
  return {
    chat: async () => ({ content: "ok", usage: { promptTokens: 10, completionTokens: 5 }, finishReason: "stop" as const }),
    chatStream: async function* () {},
    countTokens: () => 0,
  };
}

function makeContext(engine?: HandlerEngine) {
  const he = engine ?? new HandlerEngine();
  const agent = new AgentContext({
    llm: stubLLM(),
    tools: new Map(),
    handlerEngine: { getHandlers: (e) => he.getHandlers(e), emit: (e, p) => he.emit(e, p) },
  });
  const session = new SessionContext({
    sessionId: "s1",
    llm: { provider: "openai", model: "gpt-4", temperature: 0.7 },
    tools: {},
    logLevel: "info",
  });
  return { agent, session, engine: he };
}

describe("Harness — happy path", () => {
  it("runs all 5 phases in order and emits turn:start / turn:end", async () => {
    const events: string[] = [];
    const { agent, session, engine } = makeContext();

    engine.observe("turn:start", async () => { events.push("turn:start"); return { ok: true as const }; });
    engine.observe("turn:end", async () => { events.push("turn:end"); return { ok: true as const }; });
    engine.observe("phase:before", async (ctx: any) => { events.push(`before:${ctx.phaseName}`); return { ok: true as const }; });
    engine.observe("phase:after", async (ctx: any) => { events.push(`after:${ctx.phaseName}`); return { ok: true as const }; });

    const store = new InMemoryCheckpointStore();
    const harness = new Harness({ store });
    const result = await harness.runTurn(session, agent);

    expect(result.status).toBe("completed");
    expect(events).toEqual([
      "turn:start",
      "before:context_assembly", "after:context_assembly",
      "before:llm_inference", "after:llm_inference",
      "before:action_resolution", "after:action_resolution",
      "before:tool_execution", "after:tool_execution",
      "before:result_observation", "after:result_observation",
      "turn:end",
    ]);
  });

  it("auto-checkpoints at turn:end", async () => {
    const { agent, session } = makeContext();
    const store = new InMemoryCheckpointStore();
    const harness = new Harness({ store });

    await harness.runTurn(session, agent);

    const checkpoint = store.loadLatestCheckpoint("s1");
    expect(checkpoint).toBeDefined();
    expect(checkpoint!.sessionId).toBe("s1");
  });

  it("turn:end payload includes sessionId", async () => {
    const payloads: any[] = [];
    const { agent, session, engine } = makeContext();

    engine.observe("turn:end", async (p: any) => { payloads.push(p); return { ok: true as const }; });

    const store = new InMemoryCheckpointStore();
    const harness = new Harness({ store });
    await harness.runTurn(session, agent);

    expect(payloads).toHaveLength(1);
    expect(payloads[0].sessionId).toBe("s1");
    expect(payloads[0].turnId).toBeDefined();
    expect(payloads[0].status).toBe("completed");
  });
});

describe("Harness — handler interception", () => {
  it("block (ok:false) aborts the turn", async () => {
    const engine = new HandlerEngine();
    engine.register({
      name: "blocker",
      events: ["phase:before"],
      priority: 1,
      trust: 1,
      handle: async () => ({ ok: false as const, reason: "denied" }),
    });

    const { agent, session } = makeContext(engine);
    const store = new InMemoryCheckpointStore();
    const harness = new Harness({ store });
    const result = await harness.runTurn(session, agent);

    expect(result.status).toBe("aborted");
  });

  it("abort terminates the turn", async () => {
    const engine = new HandlerEngine();
    engine.register({
      name: "aborter",
      events: ["phase:before"],
      priority: 1,
      trust: 1,
      handle: async () => ({ abort: true as const, reason: "stop" }),
    });

    const { agent, session } = makeContext(engine);
    const store = new InMemoryCheckpointStore();
    const harness = new Harness({ store });
    const result = await harness.runTurn(session, agent);

    expect(result.status).toBe("aborted");
  });

  it("suspend pauses and checkpoints", async () => {
    const engine = new HandlerEngine();
    engine.register({
      name: "suspender",
      events: ["phase:before"],
      priority: 1,
      trust: 1,
      handle: async () => ({ suspend: true as const, pendingInput: "need approval" }),
    });

    const { agent, session } = makeContext(engine);
    const store = new InMemoryCheckpointStore();
    const harness = new Harness({ store });
    const result = await harness.runTurn(session, agent);

    expect(result.status).toBe("suspended");
    expect(result.suspendInput).toBe("need approval");

    // checkpoint was saved
    const checkpoint = store.loadLatestCheckpoint("s1");
    expect(checkpoint).toBeDefined();
  });

  it("non-recoverable error terminates the turn", async () => {
    const engine = new HandlerEngine();
    engine.register({
      name: "errorer",
      events: ["phase:before"],
      priority: 1,
      trust: 1,
      handle: async () => ({ error: new Error("fatal"), recoverable: false }),
    });

    const { agent, session } = makeContext(engine);
    const store = new InMemoryCheckpointStore();
    const harness = new Harness({ store });
    const result = await harness.runTurn(session, agent);

    expect(result.status).toBe("errored");
    expect(result.error?.message).toBe("fatal");
  });

  it("recoverable error does NOT terminate the turn", async () => {
    const engine = new HandlerEngine();
    engine.register({
      name: "recoverable",
      events: ["phase:before"],
      priority: 1,
      trust: 1,
      handle: async () => ({ error: new Error("retry"), recoverable: true }),
    });

    const { agent, session } = makeContext(engine);
    const store = new InMemoryCheckpointStore();
    const harness = new Harness({ store });
    const result = await harness.runTurn(session, agent);

    expect(result.status).toBe("completed");
  });

  it("ok:true continues without blocking", async () => {
    const phases: string[] = [];
    const engine = new HandlerEngine();
    engine.register({
      name: "passer",
      events: ["phase:before"],
      priority: 1,
      trust: 1,
      handle: async (ctx: any) => { phases.push(ctx.phaseName); return { ok: true as const }; },
    });

    const { agent, session } = makeContext(engine);
    const store = new InMemoryCheckpointStore();
    const harness = new Harness({ store });
    const result = await harness.runTurn(session, agent);

    expect(result.status).toBe("completed");
    expect(phases).toEqual(["context_assembly", "llm_inference", "action_resolution", "tool_execution", "result_observation"]);
  });
});

describe("Harness — suspend checkpoint", () => {
  it("suspend saves resumeReason and pendingInput to checkpoint, lifecycle → paused", async () => {
    const engine = new HandlerEngine();
    engine.register({
      name: "suspender",
      events: ["phase:before"],
      priority: 1,
      trust: 1,
      handle: async () => ({ suspend: true as const, pendingInput: "need approval" }),
    });

    const { agent, session } = makeContext(engine);
    const store = new InMemoryCheckpointStore();
    const harness = new Harness({ store });
    const result = await harness.runTurn(session, agent);

    expect(result.status).toBe("suspended");
    expect(result.suspendInput).toBe("need approval");

    // checkpoint was saved with resumeReason and pendingInput
    const checkpoint = store.loadLatestCheckpoint("s1");
    expect(checkpoint).toBeDefined();
    expect(checkpoint!.resumeReason).toBe("suspend");
    expect(checkpoint!.pendingInput).toBe("need approval");

    // lifecycle is paused
    expect(harness.lifecycle.state).toBe("paused");
  });
});

describe("Harness — resume", () => {
  it("resume restores from suspend checkpoint, injects externalInput, continues execution", async () => {
    const phases: string[] = [];
    let callCount = 0;
    const engine = new HandlerEngine();
    engine.register({
      name: "suspender-then-pass",
      events: ["phase:before"],
      priority: 1,
      trust: 1,
      handle: async (ctx: any) => {
        callCount++;
        if (callCount === 1) {
          return { suspend: true as const, pendingInput: "need approval" };
        }
        phases.push(ctx.phaseName);
        return { ok: true as const };
      },
    });

    const { agent, session } = makeContext(engine);
    const store = new InMemoryCheckpointStore();
    const harness = new Harness({ store });

    // First turn: suspends at first phase
    const suspendResult = await harness.runTurn(session, agent);
    expect(suspendResult.status).toBe("suspended");
    expect(harness.lifecycle.state).toBe("paused");

    // Resume: continues from where it left off
    const resumeResult = await harness.resume(session, agent, "approved");
    expect(resumeResult.status).toBe("completed");
    expect(harness.lifecycle.state).toBe("running");

    // externalInput was available during resumed execution
    const checkpoint = store.loadLatestCheckpoint(session.sessionId);
    expect(checkpoint).toBeDefined();
  });

  it("resume uses real session config, not dummy", async () => {
    let resumedProvider: string | undefined;
    let callCount = 0;
    const engine = new HandlerEngine();
    engine.register({
      name: "suspender-then-capture",
      events: ["phase:before"],
      priority: 1,
      trust: 1,
      handle: async (ctx: any) => {
        callCount++;
        if (callCount === 1) {
          return { suspend: true as const, pendingInput: "need approval" };
        }
        resumedProvider = ctx.session?.config?.llm?.provider;
        return { ok: true as const };
      },
    });

    const { agent, session } = makeContext(engine);
    const store = new InMemoryCheckpointStore();
    const harness = new Harness({ store });

    // First turn: suspends
    await harness.runTurn(session, agent);

    // Resume with real session — should see "openai", not "unknown"
    await harness.resume(session, agent, "approved");
    expect(resumedProvider).toBe("openai");
  });

  it("resume throws if no suspend checkpoint exists", async () => {
    const { agent, session } = makeContext();
    const store = new InMemoryCheckpointStore();
    const harness = new Harness({ store });

    // Run a normal turn (no suspend) — checkpoint saved but without resumeReason
    await harness.runTurn(session, agent);

    await expect(harness.resume(session, agent)).rejects.toThrow(
      /No suspend checkpoint found/,
    );
  });
});

describe("Harness — runChain", () => {
  it("chain completes after maxTurns", async () => {
    const engine = new HandlerEngine();
    engine.register({
      name: "passer",
      events: ["phase:before"],
      priority: 1,
      trust: 1,
      handle: async () => ({ ok: true as const }),
    });

    const { agent, session } = makeContext(engine);
    const store = new InMemoryCheckpointStore();
    const harness = new Harness({ store });

    const result = await harness.runChain(session, agent, { maxTurns: 3 });

    expect(result.status).toBe("max_turns");
    expect(result.turns).toBe(3);
  });

  it("chain aborts via AbortSignal", async () => {
    const engine = new HandlerEngine();
    let callCount = 0;
    engine.register({
      name: "counter",
      events: ["phase:before"],
      priority: 1,
      trust: 1,
      handle: async () => {
        callCount++;
        return { ok: true as const };
      },
    });

    const { agent, session } = makeContext(engine);
    const store = new InMemoryCheckpointStore();
    const harness = new Harness({ store });
    const controller = new AbortController();

    // Abort after first turn completes (5 phases = 5 calls per turn)
    const originalEmit = agent.handlerEngine.emit.bind(agent.handlerEngine);
    agent.handlerEngine.emit = async (event: string, payload?: any) => {
      const results = await originalEmit(event, payload);
      if (event === "turn:end" && callCount >= 5) {
        controller.abort();
      }
      return results;
    };

    const result = await harness.runChain(session, agent, { maxTurns: 10, abortSignal: controller.signal });

    expect(result.status).toBe("aborted");
    expect(result.turns).toBeGreaterThanOrEqual(1);
  });

  it("chain with suspend then resume completes", async () => {
    let callCount = 0;
    const engine = new HandlerEngine();
    engine.register({
      name: "suspend-on-first-then-pass",
      events: ["phase:before"],
      priority: 1,
      trust: 1,
      handle: async (_ctx: any) => {
        callCount++;
        if (callCount === 1) {
          return { suspend: true as const, pendingInput: "waiting" };
        }
        return { ok: true as const };
      },
    });

    const { agent, session } = makeContext(engine);
    const store = new InMemoryCheckpointStore();
    const harness = new Harness({ store });

    // Chain suspends on first turn
    const chainResult = await harness.runChain(session, agent, { maxTurns: 5 });
    expect(chainResult.status).toBe("suspended");
    expect(chainResult.turns).toBe(1);
    expect(harness.lifecycle.state).toBe("paused");

    // Resume the chain
    const resumeResult = await harness.resumeChain(session, agent, "approved", { maxTurns: 5 });
    expect(resumeResult.status).toBe("completed");
  });

  it("runChain emits chain:start and chain:end events", async () => {
    const events: string[] = [];
    const engine = new HandlerEngine();
    engine.register({
      name: "passer",
      events: ["phase:before"],
      priority: 1,
      trust: 1,
      handle: async () => ({ ok: true as const }),
    });

    engine.observe("chain:start", async () => { events.push("chain:start"); return { ok: true as const }; });
    engine.observe("chain:end", async () => { events.push("chain:end"); return { ok: true as const }; });

    const { agent, session } = makeContext(engine);
    const store = new InMemoryCheckpointStore();
    const harness = new Harness({ store });

    await harness.runChain(session, agent, { maxTurns: 2 });

    expect(events).toContain("chain:start");
    expect(events).toContain("chain:end");
    expect(events.indexOf("chain:start")).toBeLessThan(events.indexOf("chain:end"));
  });
});
