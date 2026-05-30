import { describe, it, expect, beforeEach } from "vitest";
import {
  GovernanceHandler,
  createGovernanceHandlers,
  registerGovernance,
  AllowAllPolicy,
  DenyListPolicy,
  GovernanceManager,
  GovernanceHooks,
} from "./governance.js";
import type { AuditEntry, PermissionPolicy, ResponsePolicy } from "./governance.js";
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

// --- Tests ---

describe("GovernanceHandler", () => {
  let eventLog: ReturnType<typeof mockEventLog>;
  let handler: GovernanceHandler;

  beforeEach(() => {
    eventLog = mockEventLog();
    handler = new GovernanceHandler(eventLog);
  });

  it("writes approved audit entry for successful tool execution", () => {
    const ctx = makeContext({
      actions: [{ id: "tc1", name: "test-tool", arguments: {} }],
      toolResults: [{ output: "ok" }],
      toolNames: ["test-tool"],
    });

    handler.handleAfterTool(ctx);

    expect(eventLog.events).toHaveLength(1);
    const entry = eventLog.events[0].payload as AuditEntry;
    expect(entry.hookType).toBe("phase:after");
    expect(entry.toolName).toBe("test-tool");
    expect(entry.decision).toBe("approved");
    expect(entry.reason).toBe("tool execution succeeded");
    expect(entry.traceId).toBe("t1");
    expect(entry.timestamp).toBeGreaterThan(0);
    expect(eventLog.events[0].event).toBe("governance:decision");
    expect(eventLog.events[0].sessionId).toBe("s1");
  });

  it("writes denied audit entry for failed tool execution", () => {
    const ctx = makeContext({
      actions: [{ id: "tc1", name: "test-tool", arguments: {} }],
      toolResults: [{ output: null, error: { message: "permission denied", retryable: false } }],
      toolNames: ["test-tool"],
    });

    handler.handleAfterTool(ctx);

    expect(eventLog.events).toHaveLength(1);
    const entry = eventLog.events[0].payload as AuditEntry;
    expect(entry.decision).toBe("denied");
    expect(entry.reason).toBe("permission denied");
  });

  it("writes denied audit entry for tool not found in registry", () => {
    const ctx = makeContext({
      actions: [{ id: "tc1", name: "unknown-tool", arguments: {} }],
      toolResults: [],
      toolNames: [],  // no tools registered
    });

    handler.handleAfterTool(ctx);

    expect(eventLog.events).toHaveLength(1);
    const entry = eventLog.events[0].payload as AuditEntry;
    expect(entry.toolName).toBe("unknown-tool");
    expect(entry.decision).toBe("denied");
    expect(entry.reason).toBe("tool not found in registry");
  });

  it("writes multiple audit entries for multiple tool calls", () => {
    const ctx = makeContext({
      actions: [
        { id: "tc1", name: "tool-a", arguments: {} },
        { id: "tc2", name: "tool-b", arguments: {} },
      ],
      toolResults: [
        { output: "ok" },
        { output: null, error: { message: "failed", retryable: true } },
      ],
      toolNames: ["tool-a", "tool-b"],
    });

    handler.handleAfterTool(ctx);

    expect(eventLog.events).toHaveLength(2);
    expect((eventLog.events[0].payload as AuditEntry).toolName).toBe("tool-a");
    expect((eventLog.events[0].payload as AuditEntry).decision).toBe("approved");
    expect((eventLog.events[1].payload as AuditEntry).toolName).toBe("tool-b");
    expect((eventLog.events[1].payload as AuditEntry).decision).toBe("denied");
    expect((eventLog.events[1].payload as AuditEntry).reason).toBe("failed");
  });

  it("handles mixed found and missing tools", () => {
    const ctx = makeContext({
      actions: [
        { id: "tc1", name: "known-tool", arguments: {} },
        { id: "tc2", name: "unknown-tool", arguments: {} },
        { id: "tc3", name: "known-tool", arguments: {} },
      ],
      toolResults: [
        { output: "ok" },
        { output: "ok" },
      ],
      toolNames: ["known-tool"],
    });

    handler.handleAfterTool(ctx);

    expect(eventLog.events).toHaveLength(3);
    expect((eventLog.events[0].payload as AuditEntry).toolName).toBe("known-tool");
    expect((eventLog.events[0].payload as AuditEntry).decision).toBe("approved");
    expect((eventLog.events[1].payload as AuditEntry).toolName).toBe("unknown-tool");
    expect((eventLog.events[1].payload as AuditEntry).decision).toBe("denied");
    expect((eventLog.events[1].payload as AuditEntry).reason).toBe("tool not found in registry");
    expect((eventLog.events[2].payload as AuditEntry).toolName).toBe("known-tool");
    expect((eventLog.events[2].payload as AuditEntry).decision).toBe("approved");
  });

  it("does nothing when no actions are present", () => {
    const ctx = makeContext({ toolNames: ["test-tool"] });

    handler.handleAfterTool(ctx);

    expect(eventLog.events).toHaveLength(0);
  });

  it("uses turnId as traceId", () => {
    const ctx = makeContext({
      turnId: "turn_abc_123",
      actions: [{ id: "tc1", name: "test-tool", arguments: {} }],
      toolResults: [{ output: "ok" }],
      toolNames: ["test-tool"],
    });

    handler.handleAfterTool(ctx);

    expect((eventLog.events[0].payload as AuditEntry).traceId).toBe("turn_abc_123");
  });

  it("uses sessionId from context for StoreEvent", () => {
    const ctx = makeContext({
      sessionId: "session-xyz",
      actions: [{ id: "tc1", name: "test-tool", arguments: {} }],
      toolResults: [{ output: "ok" }],
      toolNames: ["test-tool"],
    });

    handler.handleAfterTool(ctx);

    expect(eventLog.events[0].sessionId).toBe("session-xyz");
  });
});

describe("createGovernanceHandlers", () => {
  it("returns one handler for tool_execution phase:after", () => {
    const handlers = createGovernanceHandlers(mockEventLog());
    expect(handlers).toHaveLength(1);
    expect(handlers[0].name).toBe("governance:after-tool");
    expect(handlers[0].events).toContain("phase:after");
    expect(handlers[0].phases).toContain("tool_execution");
  });

  it("handler has priority 50 and trust 3", () => {
    const handlers = createGovernanceHandlers(mockEventLog());
    expect(handlers[0].priority).toBe(50);
    expect(handlers[0].trust).toBe(3);
    expect(handlers[0].builtin).toBe(true);
  });
});

describe("registerGovernance", () => {
  it("registers governance handler on engine", () => {
    const engine = new HandlerEngine();
    registerGovernance(engine, mockEventLog());

    const handlers = engine.getHandlers("phase:after", { phaseName: "tool_execution" });
    expect(handlers.some((h) => h.name === "governance:after-tool")).toBe(true);
  });

  it("handler writes audit entries when emitted via engine", async () => {
    const eventLog = mockEventLog();
    const engine = new HandlerEngine();
    registerGovernance(engine, eventLog);

    const ctx = makeContext({
      actions: [{ id: "tc1", name: "test-tool", arguments: {} }],
      toolResults: [{ output: "ok" }],
      toolNames: ["test-tool"],
    });

    await engine.emit("phase:after", { phaseName: "tool_execution", ...ctx });

    expect(eventLog.events).toHaveLength(1);
    expect(eventLog.events[0].event).toBe("governance:decision");
    expect((eventLog.events[0].payload as AuditEntry).toolName).toBe("test-tool");
    expect((eventLog.events[0].payload as AuditEntry).decision).toBe("approved");
  });
});

describe("AuditEntry structure", () => {
  it("contains all required fields", () => {
    const eventLog = mockEventLog();
    const handler = new GovernanceHandler(eventLog);
    const ctx = makeContext({
      actions: [{ id: "tc1", name: "test-tool", arguments: {} }],
      toolResults: [{ output: "ok" }],
      toolNames: ["test-tool"],
    });

    handler.handleAfterTool(ctx);

    const entry = eventLog.events[0].payload as AuditEntry;
    expect(entry).toHaveProperty("timestamp");
    expect(entry).toHaveProperty("hookType");
    expect(entry).toHaveProperty("toolName");
    expect(entry).toHaveProperty("decision");
    expect(entry).toHaveProperty("reason");
    expect(entry).toHaveProperty("traceId");
    expect(typeof entry.timestamp).toBe("number");
    expect(typeof entry.hookType).toBe("string");
    expect(typeof entry.toolName).toBe("string");
    expect(typeof entry.decision).toBe("string");
    expect(typeof entry.reason).toBe("string");
    expect(typeof entry.traceId).toBe("string");
  });
});

// --- PermissionPolicy tests ---

describe("AllowAllPolicy", () => {
  it("always returns allowed: true", () => {
    const policy = new AllowAllPolicy();
    expect(policy.canExecute("any-tool", {}, makeContext())).toEqual({ allowed: true });
  });

  it("allows regardless of tool name or params", () => {
    const policy = new AllowAllPolicy();
    expect(policy.canExecute("dangerous-tool", { cmd: "rm -rf /" }, makeContext())).toEqual({ allowed: true });
  });
});

describe("DenyListPolicy", () => {
  const ctx = makeContext();

  it("returns allowed: true for tools not in deny list", () => {
    const policy = new DenyListPolicy(["rm", "eval"]);
    expect(policy.canExecute("search", {}, ctx)).toEqual({ allowed: true });
  });

  it("returns allowed: false with reason for denied tools", () => {
    const policy = new DenyListPolicy(["rm", "eval"]);
    const result = policy.canExecute("rm", {}, ctx);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("rm");
    expect(result.reason).toContain("deny list");
  });

  it("denies all tools in the list", () => {
    const policy = new DenyListPolicy(["rm", "eval", "exec"]);
    expect(policy.canExecute("rm", {}, ctx).allowed).toBe(false);
    expect(policy.canExecute("eval", {}, ctx).allowed).toBe(false);
    expect(policy.canExecute("exec", {}, ctx).allowed).toBe(false);
    expect(policy.canExecute("search", {}, ctx).allowed).toBe(true);
  });

  it("handles empty deny list (allows everything)", () => {
    const policy = new DenyListPolicy([]);
    expect(policy.canExecute("any-tool", {}, ctx).allowed).toBe(true);
  });
});

// --- GovernanceManager tests ---

describe("GovernanceManager", () => {
  it("registers before-tool handler on engine via registerBeforeTool()", () => {
    const engine = new HandlerEngine();
    const manager = new GovernanceManager({ policies: [new AllowAllPolicy()] });
    manager.registerBeforeTool(engine);

    const handlers = engine.getHandlers("phase:before", { phaseName: "tool_execution" });
    expect(handlers.some((h) => h.name === "governance:before-tool")).toBe(true);
  });

  it("handler has priority 1 and trust 3 and is builtin", () => {
    const engine = new HandlerEngine();
    const manager = new GovernanceManager({ policies: [new AllowAllPolicy()] });
    manager.registerBeforeTool(engine);

    const handlers = engine.getHandlers("phase:before", { phaseName: "tool_execution" });
    const govHandler = handlers.find((h) => h.name === "governance:before-tool")!;
    expect(govHandler.priority).toBe(1);
    expect(govHandler.trust).toBe(3);
    expect(govHandler.builtin).toBe(true);
  });

  it("passes through when policy allows", async () => {
    const engine = new HandlerEngine();
    const eventLog = mockEventLog();
    const manager = new GovernanceManager({ policies: [new AllowAllPolicy()], eventLog });
    manager.registerBeforeTool(engine);

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
    const manager = new GovernanceManager({ policies: [new DenyListPolicy(["rm"])], eventLog });
    manager.registerBeforeTool(engine);

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
    const manager = new GovernanceManager({ policies: [new DenyListPolicy(["rm"])], eventLog });
    manager.registerBeforeTool(engine);

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
    const manager = new GovernanceManager({ policies: [new DenyListPolicy(["rm"])] });
    manager.registerBeforeTool(engine);

    const ctx = makeContext({ toolNames: ["search"] });

    const results = await engine.emit("phase:before", { phaseName: "tool_execution", ...ctx });
    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({ ok: true });
  });

  it("works without eventLog (no crash on deny)", async () => {
    const engine = new HandlerEngine();
    const manager = new GovernanceManager({ policies: [new DenyListPolicy(["rm"])] });
    manager.registerBeforeTool(engine);

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
    const manager = new GovernanceManager({
      policies: [new AllowAllPolicy(), new DenyListPolicy(["rm"])],
      eventLog,
    });
    manager.registerBeforeTool(engine);

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
    const manager = new GovernanceManager({ policies: [asyncPolicy], eventLog });
    manager.registerBeforeTool(engine);

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
    const manager = new GovernanceManager({ policies: [new AllowAllPolicy()] });
    manager.registerBeforeTool(engine);

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
});

// --- GovernanceHooks tests ---

describe("GovernanceHooks", () => {
  it("constructor accepts a HandlerEngine", () => {
    const engine = new HandlerEngine();
    const hooks = new GovernanceHooks(engine);
    expect(hooks).toBeInstanceOf(GovernanceHooks);
  });

  it("registerBeforeLlm registers handler at priority 100 for context_assembly phase:before", () => {
    const engine = new HandlerEngine();
    const hooks = new GovernanceHooks(engine);
    hooks.registerBeforeLlm(async () => {});

    const handlers = engine.getHandlers("phase:before", { phaseName: "context_assembly" });
    const govHandler = handlers.find((h) => h.name === "governance-hooks:before-llm");
    expect(govHandler).toBeDefined();
    expect(govHandler!.priority).toBe(100);
    expect(govHandler!.trust).toBe(3);
    expect(govHandler!.builtin).toBe(true);
    expect(govHandler!.phases).toContain("context_assembly");
    expect(govHandler!.events).toContain("phase:before");
  });

  it("registerBeforeLlm returns this for chaining", () => {
    const engine = new HandlerEngine();
    const hooks = new GovernanceHooks(engine);
    const result = hooks.registerBeforeLlm(async () => {}).registerBeforeLlm(async () => {});
    expect(result).toBe(hooks);
  });

  it("single hook passes through with ok:true", async () => {
    const engine = new HandlerEngine();
    const hooks = new GovernanceHooks(engine);
    hooks.registerBeforeLlm(async () => {});

    const ctx = makeContext();
    const results = await engine.emit("phase:before", { phaseName: "context_assembly", ...ctx });
    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({ ok: true });
  });

  it("hook returning HandlerResult passes through when ok:true", async () => {
    const engine = new HandlerEngine();
    const hooks = new GovernanceHooks(engine);
    hooks.registerBeforeLlm(async () => ({ ok: true, value: "data" }));

    const ctx = makeContext();
    const results = await engine.emit("phase:before", { phaseName: "context_assembly", ...ctx });
    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({ ok: true, value: "data" });
  });

  it("multiple hooks execute in registration order", async () => {
    const engine = new HandlerEngine();
    const order: string[] = [];
    const hooks = new GovernanceHooks(engine);
    hooks.registerBeforeLlm(async () => { order.push("first"); });
    hooks.registerBeforeLlm(async () => { order.push("second"); });
    hooks.registerBeforeLlm(async () => { order.push("third"); });

    const ctx = makeContext();
    await engine.emit("phase:before", { phaseName: "context_assembly", ...ctx });
    expect(order).toEqual(["first", "second", "third"]);
  });

  it("abort short-circuits remaining hooks", async () => {
    const engine = new HandlerEngine();
    const order: string[] = [];
    const hooks = new GovernanceHooks(engine);
    hooks.registerBeforeLlm(async () => { order.push("first"); return { abort: true, reason: "blocked" }; });
    hooks.registerBeforeLlm(async () => { order.push("second"); });

    const ctx = makeContext();
    const results = await engine.emit("phase:before", { phaseName: "context_assembly", ...ctx });
    expect(order).toEqual(["first"]);
    expect(results).toHaveLength(1);
    expect((results[0] as any).abort).toBe(true);
    expect((results[0] as any).reason).toBe("blocked");
  });

  it("ok:false short-circuits remaining hooks", async () => {
    const engine = new HandlerEngine();
    const order: string[] = [];
    const hooks = new GovernanceHooks(engine);
    hooks.registerBeforeLlm(async () => { order.push("first"); return { ok: false, reason: "denied" }; });
    hooks.registerBeforeLlm(async () => { order.push("second"); });

    const ctx = makeContext();
    const results = await engine.emit("phase:before", { phaseName: "context_assembly", ...ctx });
    expect(order).toEqual(["first"]);
    expect(results).toHaveLength(1);
    expect((results[0] as any).ok).toBe(false);
  });

  it("suspend short-circuits remaining hooks", async () => {
    const engine = new HandlerEngine();
    const order: string[] = [];
    const hooks = new GovernanceHooks(engine);
    hooks.registerBeforeLlm(async () => { order.push("first"); return { suspend: true }; });
    hooks.registerBeforeLlm(async () => { order.push("second"); });

    const ctx = makeContext();
    const results = await engine.emit("phase:before", { phaseName: "context_assembly", ...ctx });
    expect(order).toEqual(["first"]);
    expect(results).toHaveLength(1);
    expect((results[0] as any).suspend).toBe(true);
  });

  it("non-recoverable error short-circuits remaining hooks", async () => {
    const engine = new HandlerEngine();
    const order: string[] = [];
    const hooks = new GovernanceHooks(engine);
    hooks.registerBeforeLlm(async () => { order.push("first"); return { error: new Error("fatal"), recoverable: false }; });
    hooks.registerBeforeLlm(async () => { order.push("second"); });

    const ctx = makeContext();
    const results = await engine.emit("phase:before", { phaseName: "context_assembly", ...ctx });
    expect(order).toEqual(["first"]);
    expect(results).toHaveLength(1);
    expect((results[0] as any).error).toBeInstanceOf(Error);
  });

  it("recoverable error does NOT short-circuit", async () => {
    const engine = new HandlerEngine();
    const order: string[] = [];
    const hooks = new GovernanceHooks(engine);
    hooks.registerBeforeLlm(async () => { order.push("first"); return { error: new Error("retry"), recoverable: true }; });
    hooks.registerBeforeLlm(async () => { order.push("second"); });

    const ctx = makeContext();
    await engine.emit("phase:before", { phaseName: "context_assembly", ...ctx });
    expect(order).toEqual(["first", "second"]);
  });

  it("only registers one handler on the engine regardless of hook count", () => {
    const engine = new HandlerEngine();
    const hooks = new GovernanceHooks(engine);
    hooks.registerBeforeLlm(async () => {});
    hooks.registerBeforeLlm(async () => {});
    hooks.registerBeforeLlm(async () => {});

    const handlers = engine.getHandlers("phase:before", { phaseName: "context_assembly" });
    const govHandlers = handlers.filter((h) => h.name === "governance-hooks:before-llm");
    expect(govHandlers).toHaveLength(1);
  });

  it("handler at priority 100 sorts after priority-10 processors", () => {
    const engine = new HandlerEngine();
    const hooks = new GovernanceHooks(engine);
    hooks.registerBeforeLlm(async () => {});

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
    expect(handlers[handlers.length - 1].name).toBe("governance-hooks:before-llm");
    expect(handlers[handlers.length - 1].priority).toBe(100);
  });

  it("supports async hooks", async () => {
    const engine = new HandlerEngine();
    const hooks = new GovernanceHooks(engine);
    hooks.registerBeforeLlm(async () => {
      await new Promise((r) => setTimeout(r, 1));
      return { abort: true, reason: "async abort" };
    });

    const ctx = makeContext();
    const results = await engine.emit("phase:before", { phaseName: "context_assembly", ...ctx });
    expect(results).toHaveLength(1);
    expect((results[0] as any).abort).toBe(true);
    expect((results[0] as any).reason).toBe("async abort");
  });

  it("hook void return continues chain (no short-circuit)", async () => {
    const engine = new HandlerEngine();
    const order: string[] = [];
    const hooks = new GovernanceHooks(engine);
    hooks.registerBeforeLlm(async () => { order.push("first"); return undefined; });
    hooks.registerBeforeLlm(async () => { order.push("second"); return; });
    hooks.registerBeforeLlm(async () => { order.push("third"); });

    const ctx = makeContext();
    const results = await engine.emit("phase:before", { phaseName: "context_assembly", ...ctx });
    expect(order).toEqual(["first", "second", "third"]);
    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({ ok: true });
  });
});

// --- registerBeforeResponse tests ---

describe("registerBeforeResponse", () => {
  it("registers before-response handler on engine for result_observation phase:before", () => {
    const engine = new HandlerEngine();
    const manager = new GovernanceManager({ policies: [], responsePolicies: [] });
    manager.registerBeforeResponse(engine);

    const handlers = engine.getHandlers("phase:before", { phaseName: "result_observation" });
    expect(handlers.some((h) => h.name === "governance:before-response")).toBe(true);
  });

  it("handler has priority 1 and trust 3 and is builtin", () => {
    const engine = new HandlerEngine();
    const manager = new GovernanceManager({ policies: [], responsePolicies: [] });
    manager.registerBeforeResponse(engine);

    const handlers = engine.getHandlers("phase:before", { phaseName: "result_observation" });
    const govHandler = handlers.find((h) => h.name === "governance:before-response")!;
    expect(govHandler.priority).toBe(1);
    expect(govHandler.trust).toBe(3);
    expect(govHandler.builtin).toBe(true);
  });

  it("passes through when no response policies are configured", async () => {
    const engine = new HandlerEngine();
    const manager = new GovernanceManager({ policies: [] });
    manager.registerBeforeResponse(engine);

    const ctx = makeContext();
    const results = await engine.emit("phase:before", { phaseName: "result_observation", ...ctx });
    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({ ok: true });
  });

  it("passes through when all policies return allow", async () => {
    const allowPolicy: ResponsePolicy = {
      evaluate: async () => ({ action: "allow" }),
    };
    const engine = new HandlerEngine();
    const manager = new GovernanceManager({ policies: [], responsePolicies: [allowPolicy] });
    manager.registerBeforeResponse(engine);

    const ctx = makeContext();
    const results = await engine.emit("phase:before", { phaseName: "result_observation", ...ctx });
    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({ ok: true });
  });

  it("returns suspend when policy evaluates to suspend", async () => {
    const suspendPolicy: ResponsePolicy = {
      evaluate: async () => ({ action: "suspend", pendingInput: { key: "value" } }),
    };
    const engine = new HandlerEngine();
    const manager = new GovernanceManager({ policies: [], responsePolicies: [suspendPolicy] });
    manager.registerBeforeResponse(engine);

    const ctx = makeContext();
    const results = await engine.emit("phase:before", { phaseName: "result_observation", ...ctx });
    expect(results).toHaveLength(1);
    expect((results[0] as any).suspend).toBe(true);
    expect((results[0] as any).pendingInput).toEqual({ key: "value" });
  });

  it("returns suspend without pendingInput when policy evaluates to bare suspend", async () => {
    const suspendPolicy: ResponsePolicy = {
      evaluate: async () => ({ action: "suspend" }),
    };
    const engine = new HandlerEngine();
    const manager = new GovernanceManager({ policies: [], responsePolicies: [suspendPolicy] });
    manager.registerBeforeResponse(engine);

    const ctx = makeContext();
    const results = await engine.emit("phase:before", { phaseName: "result_observation", ...ctx });
    expect(results).toHaveLength(1);
    expect((results[0] as any).suspend).toBe(true);
    expect((results[0] as any).pendingInput).toBeUndefined();
  });

  it("returns abort when policy evaluates to abort", async () => {
    const abortPolicy: ResponsePolicy = {
      evaluate: async () => ({ action: "abort", reason: "content policy violation" }),
    };
    const engine = new HandlerEngine();
    const manager = new GovernanceManager({ policies: [], responsePolicies: [abortPolicy] });
    manager.registerBeforeResponse(engine);

    const ctx = makeContext();
    const results = await engine.emit("phase:before", { phaseName: "result_observation", ...ctx });
    expect(results).toHaveLength(1);
    expect((results[0] as any).abort).toBe(true);
    expect((results[0] as any).reason).toBe("content policy violation");
  });

  it("chains multiple policies: first non-allow wins (suspend)", async () => {
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
    const manager = new GovernanceManager({
      policies: [],
      responsePolicies: [policy1, policy2, policy3],
    });
    manager.registerBeforeResponse(engine);

    const ctx = makeContext();
    const results = await engine.emit("phase:before", { phaseName: "result_observation", ...ctx });
    expect(order).toEqual(["p1", "p2"]);
    expect((results[0] as any).suspend).toBe(true);
  });

  it("chains multiple policies: first non-allow wins (abort)", async () => {
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
    const manager = new GovernanceManager({
      policies: [],
      responsePolicies: [policy1, policy2, policy3],
    });
    manager.registerBeforeResponse(engine);

    const ctx = makeContext();
    const results = await engine.emit("phase:before", { phaseName: "result_observation", ...ctx });
    expect(order).toEqual(["p1", "p2"]);
    expect((results[0] as any).abort).toBe(true);
    expect((results[0] as any).reason).toBe("blocked");
  });

  it("all policies pass through when all return allow", async () => {
    const order: string[] = [];
    const policy1: ResponsePolicy = {
      evaluate: async () => { order.push("p1"); return { action: "allow" }; },
    };
    const policy2: ResponsePolicy = {
      evaluate: async () => { order.push("p2"); return { action: "allow" }; },
    };
    const engine = new HandlerEngine();
    const manager = new GovernanceManager({
      policies: [],
      responsePolicies: [policy1, policy2],
    });
    manager.registerBeforeResponse(engine);

    const ctx = makeContext();
    const results = await engine.emit("phase:before", { phaseName: "result_observation", ...ctx });
    expect(order).toEqual(["p1", "p2"]);
    expect(results[0]).toEqual({ ok: true });
  });

  it("supports async policies", async () => {
    const asyncPolicy: ResponsePolicy = {
      evaluate: async (_ctx) => {
        await new Promise((r) => setTimeout(r, 1));
        return { action: "abort", reason: "async abort" };
      },
    };
    const engine = new HandlerEngine();
    const manager = new GovernanceManager({ policies: [], responsePolicies: [asyncPolicy] });
    manager.registerBeforeResponse(engine);

    const ctx = makeContext();
    const results = await engine.emit("phase:before", { phaseName: "result_observation", ...ctx });
    expect((results[0] as any).abort).toBe(true);
    expect((results[0] as any).reason).toBe("async abort");
  });

  it("governance:before-response has priority 1 so it sorts before priority-10 handlers", () => {
    const engine = new HandlerEngine();
    const manager = new GovernanceManager({ policies: [], responsePolicies: [] });
    manager.registerBeforeResponse(engine);

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
    const manager = new GovernanceManager({
      policies: [new DenyListPolicy(["rm"])],
      responsePolicies: [{
        evaluate: async () => ({ action: "suspend" }),
      }],
    });
    manager.registerBeforeTool(engine);
    manager.registerBeforeResponse(engine);

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
