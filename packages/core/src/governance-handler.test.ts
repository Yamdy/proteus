import { describe, it, expect, beforeEach } from "vitest";
import {
  GovernanceHandler,
  createGovernanceHandlers,
  registerGovernance,
} from "./governance.js";
import type { AuditEntry } from "./governance.js";
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
