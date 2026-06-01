import { describe, it, expect } from "vitest";
import {
  Governance,
  AllowAllPolicy,
  DenyListPolicy,
} from "./governance.js";
import type { PermissionPolicy, ResponsePolicy } from "./governance.js";
import type { EventLog, StoreEvent } from "./checkpoint-store.js";
import { HandlerEngine } from "./handler-engine.js";
import { AgentContext, SessionContext, TurnContext, HandlerContext } from "./context.js";
import type { LLMProvider, ToolResult, ToolCall } from "./types.js";

// --- Helpers ---

function stubLLM(): LLMProvider {
  return {
    chat: async () => ({ content: "", usage: { promptTokens: 0, completionTokens: 0 }, finishReason: "stop" as const }),
    chatStream: async function* () {},
    countTokens: () => 0,
  };
}

function mockEventLog(): EventLog & { events: StoreEvent[] } {
  const events: StoreEvent[] = [];
  return {
    events,
    appendEvent(event: StoreEvent) { events.push(event); },
    queryEvents() { return []; },
    queryAllEvents() { return events; },
  };
}

function makeContext(opts: {
  sessionId?: string;
  turnId?: string;
  actions?: ToolCall[];
  toolResults?: ToolResult[];
  toolNames?: string[];
} = {}): HandlerContext {
  const sessionId = opts.sessionId ?? "s1";
  const turnId = opts.turnId ?? "t1";

  const tools = new Map<string, any>();
  for (const name of opts.toolNames ?? ["test-tool"]) {
    tools.set(name, {
      definition: { name, description: "test", parameters: {} },
      execute: async () => ({ output: "ok" }),
    });
  }

  const agent = new AgentContext({ llm: stubLLM(), tools: tools as any });
  const session = new SessionContext({
    sessionId,
    llm: { provider: "openai", model: "gpt-4", temperature: 0.7 },
    tools: {},
    logLevel: "info",
  });
  const turn = new TurnContext({ turnId, agent, session });

  if (opts.actions) {
    turn.actions = opts.actions;
  }
  if (opts.toolResults) {
    for (const r of opts.toolResults) {
      turn.addToolResult(r);
    }
  }

  return new HandlerContext({ agent, session, turn });
}

// --- Governance tests ---

describe("Governance", () => {
  it("registers before-tool handler on engine via registerBeforeTool()", () => {
    const engine = new HandlerEngine();
    const gov = new Governance({ policies: [new AllowAllPolicy()] });
    gov.registerBeforeTool(engine);

    const handlers = engine.getHandlers("phase:before", { phaseName: "tool_execution" });
    expect(handlers.some((h) => h.name === "governance:before-tool")).toBe(true);
  });

  it("handler has priority 1 and trust 3 and is builtin", () => {
    const engine = new HandlerEngine();
    const gov = new Governance({ policies: [new AllowAllPolicy()] });
    gov.registerBeforeTool(engine);

    const handlers = engine.getHandlers("phase:before", { phaseName: "tool_execution" });
    const govHandler = handlers.find((h) => h.name === "governance:before-tool")!;
    expect(govHandler.priority).toBe(1);
    expect(govHandler.trust).toBe(3);
    expect(govHandler.builtin).toBe(true);
  });

  it("passes through when policy allows", async () => {
    const engine = new HandlerEngine();
    const eventLog = mockEventLog();
    const gov = new Governance({ policies: [new AllowAllPolicy()], eventLog });
    gov.registerBeforeTool(engine);

    const ctx = makeContext({
      actions: [{ id: "tc1", name: "search", arguments: { query: "test" } }],
      toolNames: ["search"],
    });

    const results = await engine.emit("phase:before", { phaseName: "tool_execution", ...ctx });
    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({ ok: true });
    expect(eventLog.events).toHaveLength(0);
  });

  it("blocks and writes governance:decision when DenyListPolicy denies", async () => {
    const engine = new HandlerEngine();
    const eventLog = mockEventLog();
    const gov = new Governance({ policies: [new DenyListPolicy(["rm"])], eventLog });
    gov.registerBeforeTool(engine);

    const ctx = makeContext({
      actions: [{ id: "tc1", name: "rm", arguments: { path: "/tmp" } }],
      toolNames: ["rm"],
    });

    const results = await engine.emit("phase:before", { phaseName: "tool_execution", ...ctx });
    expect(results).toHaveLength(1);
    expect((results[0] as any).ok).toBe(false);
    expect((results[0] as any).reason).toContain("deny list");

    expect(eventLog.events).toHaveLength(1);
    expect(eventLog.events[0].event).toBe("governance:decision");
    expect(eventLog.events[0].sessionId).toBe("s1");
    const payload = eventLog.events[0].payload as any;
    expect(payload.toolName).toBe("rm");
    expect(payload.decision).toBe("denied");
    expect(payload.hookType).toBe("phase:before");
  });

  it("short-circuits: first denied tool stops further execution", async () => {
    const engine = new HandlerEngine();
    const eventLog = mockEventLog();
    const gov = new Governance({ policies: [new DenyListPolicy(["rm"])], eventLog });
    gov.registerBeforeTool(engine);

    const ctx = makeContext({
      actions: [
        { id: "tc1", name: "rm", arguments: {} },
        { id: "tc2", name: "search", arguments: {} },
      ],
      toolNames: ["rm", "search"],
    });

    const results = await engine.emit("phase:before", { phaseName: "tool_execution", ...ctx });
    expect(results).toHaveLength(1);
    expect((results[0] as any).ok).toBe(false);
  });

  it("passes through when no actions are present", async () => {
    const engine = new HandlerEngine();
    const gov = new Governance({ policies: [new DenyListPolicy(["rm"])] });
    gov.registerBeforeTool(engine);

    const ctx = makeContext({ toolNames: ["search"] });

    const results = await engine.emit("phase:before", { phaseName: "tool_execution", ...ctx });
    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({ ok: true });
  });

  it("works without eventLog (no crash on deny)", async () => {
    const engine = new HandlerEngine();
    const gov = new Governance({ policies: [new DenyListPolicy(["rm"])] });
    gov.registerBeforeTool(engine);

    const ctx = makeContext({
      actions: [{ id: "tc1", name: "rm", arguments: {} }],
      toolNames: ["rm"],
    });

    const results = await engine.emit("phase:before", { phaseName: "tool_execution", ...ctx });
    expect((results[0] as any).ok).toBe(false);
    expect((results[0] as any).reason).toContain("deny list");
  });

  it("supports multiple policies (first deny wins)", async () => {
    const engine = new HandlerEngine();
    const eventLog = mockEventLog();
    const gov = new Governance({
      policies: [new AllowAllPolicy(), new DenyListPolicy(["rm"])],
      eventLog,
    });
    gov.registerBeforeTool(engine);

    const ctx = makeContext({
      actions: [{ id: "tc1", name: "rm", arguments: {} }],
      toolNames: ["rm"],
    });

    const results = await engine.emit("phase:before", { phaseName: "tool_execution", ...ctx });
    expect((results[0] as any).ok).toBe(false);
  });

  it("supports async policy", async () => {
    const asyncPolicy: PermissionPolicy = {
      canExecute: async (toolName) => {
        await new Promise((r) => setTimeout(r, 1));
        return toolName === "blocked" ? { allowed: false, reason: "async block" } : { allowed: true };
      },
    };
    const engine = new HandlerEngine();
    const eventLog = mockEventLog();
    const gov = new Governance({ policies: [asyncPolicy], eventLog });
    gov.registerBeforeTool(engine);

    const ctx = makeContext({
      actions: [{ id: "tc1", name: "blocked", arguments: {} }],
      toolNames: ["blocked"],
    });

    const results = await engine.emit("phase:before", { phaseName: "tool_execution", ...ctx });
    expect((results[0] as any).ok).toBe(false);
    expect((results[0] as any).reason).toBe("async block");
    expect(eventLog.events).toHaveLength(1);
    expect((eventLog.events[0].payload as any).decision).toBe("denied");
  });

  it("governance:before-tool has priority 1 so it sorts before priority-10 handlers", () => {
    const engine = new HandlerEngine();
    const gov = new Governance({ policies: [new AllowAllPolicy()] });
    gov.registerBeforeTool(engine);

    // Register a handler at priority 10 (same as ToolExecutionProcessor)
    engine.register({
      name: "tool-execution",
      phases: ["tool_execution"],
      events: ["phase:before"],
      priority: 10,
      trust: 3,
      handle: async () => ({ ok: true }),
    });

    const handlers = engine.getHandlers("phase:before", { phaseName: "tool_execution" });
    expect(handlers.length).toBeGreaterThanOrEqual(2);
    expect(handlers[0].name).toBe("governance:before-tool");
    expect(handlers[0].priority).toBe(1);
    expect(handlers[1].name).toBe("tool-execution");
    expect(handlers[1].priority).toBe(10);
  });

  it("addBeforeLlmHook registers handler at priority 100 for context_assembly phase:before", () => {
    const engine = new HandlerEngine();
    const gov = new Governance();
    gov.addBeforeLlmHook(async () => {});
    gov.registerBeforeLlm(engine);

    const handlers = engine.getHandlers("phase:before", { phaseName: "context_assembly" });
    const govHandler = handlers.find((h) => h.name === "governance:before-llm");
    expect(govHandler).toBeDefined();
    expect(govHandler!.priority).toBe(100);
    expect(govHandler!.trust).toBe(3);
    expect(govHandler!.builtin).toBe(true);
    expect(govHandler!.phases).toContain("context_assembly");
    expect(govHandler!.events).toContain("phase:before");
  });

  it("addBeforeLlmHook returns this for chaining", () => {
    const gov = new Governance();
    const result = gov.addBeforeLlmHook(async () => {}).addBeforeLlmHook(async () => {});
    expect(result).toBe(gov);
  });

  it("single before-llm hook passes through with ok:true", async () => {
    const engine = new HandlerEngine();
    const gov = new Governance();
    gov.addBeforeLlmHook(async () => {});
    gov.registerBeforeLlm(engine);

    const ctx = makeContext();
    const results = await engine.emit("phase:before", { phaseName: "context_assembly", ...ctx });
    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({ ok: true });
  });

  it("before-llm hook returning HandlerResult passes through when ok:true", async () => {
    const engine = new HandlerEngine();
    const gov = new Governance();
    gov.addBeforeLlmHook(async () => ({ ok: true, value: "data" }));
    gov.registerBeforeLlm(engine);

    const ctx = makeContext();
    const results = await engine.emit("phase:before", { phaseName: "context_assembly", ...ctx });
    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({ ok: true, value: "data" });
  });

  it("multiple before-llm hooks execute in registration order", async () => {
    const engine = new HandlerEngine();
    const order: string[] = [];
    const gov = new Governance();
    gov.addBeforeLlmHook(async () => { order.push("first"); });
    gov.addBeforeLlmHook(async () => { order.push("second"); });
    gov.addBeforeLlmHook(async () => { order.push("third"); });
    gov.registerBeforeLlm(engine);

    const ctx = makeContext();
    await engine.emit("phase:before", { phaseName: "context_assembly", ...ctx });
    expect(order).toEqual(["first", "second", "third"]);
  });

  it("before-llm abort short-circuits remaining hooks", async () => {
    const engine = new HandlerEngine();
    const order: string[] = [];
    const gov = new Governance();
    gov.addBeforeLlmHook(async () => { order.push("first"); return { abort: true, reason: "blocked" }; });
    gov.addBeforeLlmHook(async () => { order.push("second"); });
    gov.registerBeforeLlm(engine);

    const ctx = makeContext();
    const results = await engine.emit("phase:before", { phaseName: "context_assembly", ...ctx });
    expect(order).toEqual(["first"]);
    expect(results).toHaveLength(1);
    expect((results[0] as any).abort).toBe(true);
    expect((results[0] as any).reason).toBe("blocked");
  });

  it("before-llm ok:false short-circuits remaining hooks", async () => {
    const engine = new HandlerEngine();
    const order: string[] = [];
    const gov = new Governance();
    gov.addBeforeLlmHook(async () => { order.push("first"); return { ok: false, reason: "denied" }; });
    gov.addBeforeLlmHook(async () => { order.push("second"); });
    gov.registerBeforeLlm(engine);

    const ctx = makeContext();
    const results = await engine.emit("phase:before", { phaseName: "context_assembly", ...ctx });
    expect(order).toEqual(["first"]);
    expect(results).toHaveLength(1);
    expect((results[0] as any).ok).toBe(false);
  });

  it("before-llm suspend short-circuits remaining hooks", async () => {
    const engine = new HandlerEngine();
    const order: string[] = [];
    const gov = new Governance();
    gov.addBeforeLlmHook(async () => { order.push("first"); return { suspend: true }; });
    gov.addBeforeLlmHook(async () => { order.push("second"); });
    gov.registerBeforeLlm(engine);

    const ctx = makeContext();
    const results = await engine.emit("phase:before", { phaseName: "context_assembly", ...ctx });
    expect(order).toEqual(["first"]);
    expect(results).toHaveLength(1);
    expect((results[0] as any).suspend).toBe(true);
  });

  it("before-llm non-recoverable error short-circuits remaining hooks", async () => {
    const engine = new HandlerEngine();
    const order: string[] = [];
    const gov = new Governance();
    gov.addBeforeLlmHook(async () => { order.push("first"); return { error: { message: "fatal" }, recoverable: false }; });
    gov.addBeforeLlmHook(async () => { order.push("second"); });
    gov.registerBeforeLlm(engine);

    const ctx = makeContext();
    const results = await engine.emit("phase:before", { phaseName: "context_assembly", ...ctx });
    expect(order).toEqual(["first"]);
    expect(results).toHaveLength(1);
    expect((results[0] as any).error).toEqual({ message: "fatal" });
  });

  it("before-llm recoverable error does NOT short-circuit", async () => {
    const engine = new HandlerEngine();
    const order: string[] = [];
    const gov = new Governance();
    gov.addBeforeLlmHook(async () => { order.push("first"); return { error: { message: "retry" }, recoverable: true }; });
    gov.addBeforeLlmHook(async () => { order.push("second"); });
    gov.registerBeforeLlm(engine);

    const ctx = makeContext();
    await engine.emit("phase:before", { phaseName: "context_assembly", ...ctx });
    expect(order).toEqual(["first", "second"]);
  });

  it("only registers one before-llm handler on the engine regardless of hook count", () => {
    const engine = new HandlerEngine();
    const gov = new Governance();
    gov.addBeforeLlmHook(async () => {});
    gov.addBeforeLlmHook(async () => {});
    gov.addBeforeLlmHook(async () => {});
    gov.registerBeforeLlm(engine);

    const handlers = engine.getHandlers("phase:before", { phaseName: "context_assembly" });
    const govHandlers = handlers.filter((h) => h.name === "governance:before-llm");
    expect(govHandlers).toHaveLength(1);
  });

  it("before-llm handler at priority 100 sorts after priority-10 processors", () => {
    const engine = new HandlerEngine();
    const gov = new Governance();
    gov.addBeforeLlmHook(async () => {});
    gov.registerBeforeLlm(engine);

    engine.register({
      name: "context_assembly",
      phases: ["context_assembly"],
      events: ["phase:before"],
      priority: 10,
      trust: 3,
      handle: async () => ({ ok: true }),
    });

    const handlers = engine.getHandlers("phase:before", { phaseName: "context_assembly" });
    expect(handlers.length).toBeGreaterThanOrEqual(2);
    expect(handlers[0].name).toBe("context_assembly");
    expect(handlers[0].priority).toBe(10);
    expect(handlers[handlers.length - 1].name).toBe("governance:before-llm");
    expect(handlers[handlers.length - 1].priority).toBe(100);
  });

  it("supports async before-llm hooks", async () => {
    const engine = new HandlerEngine();
    const gov = new Governance();
    gov.addBeforeLlmHook(async () => {
      await new Promise((r) => setTimeout(r, 1));
      return { abort: true, reason: "async abort" };
    });
    gov.registerBeforeLlm(engine);

    const ctx = makeContext();
    const results = await engine.emit("phase:before", { phaseName: "context_assembly", ...ctx });
    expect(results).toHaveLength(1);
    expect((results[0] as any).abort).toBe(true);
    expect((results[0] as any).reason).toBe("async abort");
  });

  it("before-llm hook void return continues chain (no short-circuit)", async () => {
    const engine = new HandlerEngine();
    const order: string[] = [];
    const gov = new Governance();
    gov.addBeforeLlmHook(async () => { order.push("first"); return undefined; });
    gov.addBeforeLlmHook(async () => { order.push("second"); return; });
    gov.addBeforeLlmHook(async () => { order.push("third"); });
    gov.registerBeforeLlm(engine);

    const ctx = makeContext();
    const results = await engine.emit("phase:before", { phaseName: "context_assembly", ...ctx });
    expect(order).toEqual(["first", "second", "third"]);
    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({ ok: true });
  });

  it("registers before-response handler on engine for result_observation phase:before", () => {
    const engine = new HandlerEngine();
    const gov = new Governance({ policies: [], responsePolicies: [] });
    gov.registerBeforeResponse(engine);

    const handlers = engine.getHandlers("phase:before", { phaseName: "result_observation" });
    expect(handlers.some((h) => h.name === "governance:before-response")).toBe(true);
  });

  it("before-response handler has priority 1 and trust 3 and is builtin", () => {
    const engine = new HandlerEngine();
    const gov = new Governance({ policies: [], responsePolicies: [] });
    gov.registerBeforeResponse(engine);

    const handlers = engine.getHandlers("phase:before", { phaseName: "result_observation" });
    const govHandler = handlers.find((h) => h.name === "governance:before-response")!;
    expect(govHandler.priority).toBe(1);
    expect(govHandler.trust).toBe(3);
    expect(govHandler.builtin).toBe(true);
  });

  it("passes through when no response policies are configured", async () => {
    const engine = new HandlerEngine();
    const gov = new Governance({ policies: [] });
    gov.registerBeforeResponse(engine);

    const ctx = makeContext();
    const results = await engine.emit("phase:before", { phaseName: "result_observation", ...ctx });
    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({ ok: true });
  });

  it("passes through when all response policies return allow", async () => {
    const allowPolicy: ResponsePolicy = {
      evaluate: async () => ({ action: "allow" }),
    };
    const engine = new HandlerEngine();
    const gov = new Governance({ policies: [], responsePolicies: [allowPolicy] });
    gov.registerBeforeResponse(engine);

    const ctx = makeContext();
    const results = await engine.emit("phase:before", { phaseName: "result_observation", ...ctx });
    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({ ok: true });
  });

  it("returns suspend when response policy evaluates to suspend", async () => {
    const suspendPolicy: ResponsePolicy = {
      evaluate: async () => ({ action: "suspend", pendingInput: { key: "value" } }),
    };
    const engine = new HandlerEngine();
    const gov = new Governance({ policies: [], responsePolicies: [suspendPolicy] });
    gov.registerBeforeResponse(engine);

    const ctx = makeContext();
    const results = await engine.emit("phase:before", { phaseName: "result_observation", ...ctx });
    expect(results).toHaveLength(1);
    expect((results[0] as any).suspend).toBe(true);
    expect((results[0] as any).pendingInput).toEqual({ key: "value" });
  });

  it("returns suspend without pendingInput when response policy evaluates to bare suspend", async () => {
    const suspendPolicy: ResponsePolicy = {
      evaluate: async () => ({ action: "suspend" }),
    };
    const engine = new HandlerEngine();
    const gov = new Governance({ policies: [], responsePolicies: [suspendPolicy] });
    gov.registerBeforeResponse(engine);

    const ctx = makeContext();
    const results = await engine.emit("phase:before", { phaseName: "result_observation", ...ctx });
    expect(results).toHaveLength(1);
    expect((results[0] as any).suspend).toBe(true);
    expect((results[0] as any).pendingInput).toBeUndefined();
  });

  it("returns abort when response policy evaluates to abort", async () => {
    const abortPolicy: ResponsePolicy = {
      evaluate: async () => ({ action: "abort", reason: "content policy violation" }),
    };
    const engine = new HandlerEngine();
    const gov = new Governance({ policies: [], responsePolicies: [abortPolicy] });
    gov.registerBeforeResponse(engine);

    const ctx = makeContext();
    const results = await engine.emit("phase:before", { phaseName: "result_observation", ...ctx });
    expect(results).toHaveLength(1);
    expect((results[0] as any).abort).toBe(true);
    expect((results[0] as any).reason).toBe("content policy violation");
  });

  it("chains multiple response policies: first non-allow wins (suspend)", async () => {
    const order: string[] = [];
    const policy1: ResponsePolicy = {
      evaluate: async () => { order.push("p1"); return { action: "allow" }; },
    };
    const policy2: ResponsePolicy = {
      evaluate: async () => { order.push("p2"); return { action: "suspend" }; },
    };
    const policy3: ResponsePolicy = {
      evaluate: async () => { order.push("p3"); return { action: "allow" }; },
    };
    const engine = new HandlerEngine();
    const gov = new Governance({
      policies: [],
      responsePolicies: [policy1, policy2, policy3],
    });
    gov.registerBeforeResponse(engine);

    const ctx = makeContext();
    const results = await engine.emit("phase:before", { phaseName: "result_observation", ...ctx });
    expect(order).toEqual(["p1", "p2"]);
    expect((results[0] as any).suspend).toBe(true);
  });

  it("chains multiple response policies: first non-allow wins (abort)", async () => {
    const order: string[] = [];
    const policy1: ResponsePolicy = {
      evaluate: async () => { order.push("p1"); return { action: "allow" }; },
    };
    const policy2: ResponsePolicy = {
      evaluate: async () => { order.push("p2"); return { action: "abort", reason: "blocked" }; },
    };
    const policy3: ResponsePolicy = {
      evaluate: async () => { order.push("p3"); return { action: "suspend" }; },
    };
    const engine = new HandlerEngine();
    const gov = new Governance({
      policies: [],
      responsePolicies: [policy1, policy2, policy3],
    });
    gov.registerBeforeResponse(engine);

    const ctx = makeContext();
    const results = await engine.emit("phase:before", { phaseName: "result_observation", ...ctx });
    expect(order).toEqual(["p1", "p2"]);
    expect((results[0] as any).abort).toBe(true);
    expect((results[0] as any).reason).toBe("blocked");
  });

  it("all response policies pass through when all return allow", async () => {
    const order: string[] = [];
    const policy1: ResponsePolicy = {
      evaluate: async () => { order.push("p1"); return { action: "allow" }; },
    };
    const policy2: ResponsePolicy = {
      evaluate: async () => { order.push("p2"); return { action: "allow" }; },
    };
    const engine = new HandlerEngine();
    const gov = new Governance({
      policies: [],
      responsePolicies: [policy1, policy2],
    });
    gov.registerBeforeResponse(engine);

    const ctx = makeContext();
    const results = await engine.emit("phase:before", { phaseName: "result_observation", ...ctx });
    expect(order).toEqual(["p1", "p2"]);
    expect(results[0]).toEqual({ ok: true });
  });

  it("supports async response policies", async () => {
    const asyncPolicy: ResponsePolicy = {
      evaluate: async (_ctx) => {
        await new Promise((r) => setTimeout(r, 1));
        return { action: "abort", reason: "async abort" };
      },
    };
    const engine = new HandlerEngine();
    const gov = new Governance({ policies: [], responsePolicies: [asyncPolicy] });
    gov.registerBeforeResponse(engine);

    const ctx = makeContext();
    const results = await engine.emit("phase:before", { phaseName: "result_observation", ...ctx });
    expect((results[0] as any).abort).toBe(true);
    expect((results[0] as any).reason).toBe("async abort");
  });

  it("governance:before-response has priority 1 so it sorts before priority-10 handlers", () => {
    const engine = new HandlerEngine();
    const gov = new Governance({ policies: [], responsePolicies: [] });
    gov.registerBeforeResponse(engine);

    engine.register({
      name: "result-observation",
      phases: ["result_observation"],
      events: ["phase:before"],
      priority: 10,
      trust: 3,
      handle: async () => ({ ok: true }),
    });

    const handlers = engine.getHandlers("phase:before", { phaseName: "result_observation" });
    expect(handlers.length).toBeGreaterThanOrEqual(2);
    expect(handlers[0].name).toBe("governance:before-response");
    expect(handlers[0].priority).toBe(1);
    expect(handlers[1].name).toBe("result-observation");
    expect(handlers[1].priority).toBe(10);
  });

  it("does not interfere with tool_execution phase:before handler", async () => {
    const engine = new HandlerEngine();
    const gov = new Governance({
      policies: [new DenyListPolicy(["rm"])],
      responsePolicies: [{
        evaluate: async () => ({ action: "suspend" }),
      }],
    });
    gov.registerBeforeTool(engine);
    gov.registerBeforeResponse(engine);

    const toolCtx = makeContext({
      actions: [{ id: "tc1", name: "rm", arguments: {} }],
      toolNames: ["rm"],
    });
    const toolResults = await engine.emit("phase:before", { phaseName: "tool_execution", ...toolCtx });
    expect((toolResults[0] as any).ok).toBe(false);

    const resCtx = makeContext();
    const resResults = await engine.emit("phase:before", { phaseName: "result_observation", ...resCtx });
    expect((resResults[0] as any).suspend).toBe(true);
  });
});
