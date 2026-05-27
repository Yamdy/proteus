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
