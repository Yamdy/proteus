import { describe, it, expect } from "vitest";
import {
  AgentContext,
  SessionContext,
  TurnContext,
  HandlerContext,
  FrozenContext,
} from "./context.js";
import type { LLMProvider, HandlerDefinition } from "./index.js";

// --- Test helpers ---

function stubLLMProvider(): LLMProvider {
  return {
    chat: async () => ({
      content: "",
      usage: { promptTokens: 0, completionTokens: 0 },
      finishReason: "stop" as const,
    }),
    chatStream: async function* () {},
    countTokens: () => 0,
  };
}

function makeHandlerDef(name: string): HandlerDefinition {
  return { name, trust: 1, handle: async () => ({ ok: true }) };
}

// --- Tests ---

describe("AgentContext", () => {
  it("holds LLMProvider, tools, and lifecycle state", () => {
    const agent = new AgentContext({
      llm: stubLLMProvider(),
      tools: new Map(),
    });

    expect(agent.llm).toBeDefined();
    expect(agent.tools).toBeInstanceOf(Map);
  });

  it("exposes handlerRegistry as read-only", () => {
    const agent = new AgentContext({
      llm: stubLLMProvider(),
      tools: new Map(),
    });

    // handlerRegistry is a placeholder until #3 merges
    expect(agent.handlerRegistry).toBeDefined();
    expect(typeof agent.handlerRegistry.getHandlers).toBe("function");
  });
});

describe("SessionContext", () => {
  it("holds SessionConfig, WorkingMemory, and CostTracker", () => {
    const session = new SessionContext({
      sessionId: "s1",
      llm: { provider: "openai", model: "gpt-4", temperature: 0.7 },
      tools: {},
      logLevel: "info",
    });

    expect(session.sessionId).toBe("s1");
    expect(session.workingMemory).toBeDefined();
    expect(session.costTracker).toBeDefined();
  });

  it("WorkingMemory can push and retrieve messages", () => {
    const session = new SessionContext({
      sessionId: "s1",
      llm: { provider: "openai", model: "gpt-4", temperature: 0.7 },
      tools: {},
      logLevel: "info",
    });

    session.workingMemory.push({ role: "user", content: "hello" });
    expect(session.workingMemory.getMessages()).toHaveLength(1);
    expect(session.workingMemory.getMessages()[0].content).toBe("hello");
  });

  it("CostTracker accumulates token usage", () => {
    const session = new SessionContext({
      sessionId: "s1",
      llm: { provider: "openai", model: "gpt-4", temperature: 0.7 },
      tools: {},
      logLevel: "info",
    });

    session.costTracker.addUsage({ promptTokens: 100, completionTokens: 50 });
    session.costTracker.addUsage({ promptTokens: 200, completionTokens: 80 });

    const totals = session.costTracker.getTotals();
    expect(totals.promptTokens).toBe(300);
    expect(totals.completionTokens).toBe(130);
  });
});

describe("TurnContext", () => {
  it("holds current messages, tool results, and prompt fragments", () => {
    const agent = new AgentContext({ llm: stubLLMProvider(), tools: new Map() });
    const session = new SessionContext({
      sessionId: "s1",
      llm: { provider: "openai", model: "gpt-4", temperature: 0.7 },
      tools: {},
      logLevel: "info",
    });

    const turn = new TurnContext({
      turnId: "t1",
      agent,
      session,
    });

    expect(turn.turnId).toBe("t1");
    expect(turn.messages).toEqual([]);
    expect(turn.toolResults).toEqual([]);
    expect(turn.promptFragments).toEqual([]);
  });

  it("references parent contexts as read-only", () => {
    const agent = new AgentContext({ llm: stubLLMProvider(), tools: new Map() });
    const session = new SessionContext({
      sessionId: "s1",
      llm: { provider: "openai", model: "gpt-4", temperature: 0.7 },
      tools: {},
      logLevel: "info",
    });

    const turn = new TurnContext({ turnId: "t1", agent, session });

    expect(turn.agent).toBe(agent);
    expect(turn.session).toBe(session);
  });

  it("can add messages and tool results", () => {
    const agent = new AgentContext({ llm: stubLLMProvider(), tools: new Map() });
    const session = new SessionContext({
      sessionId: "s1",
      llm: { provider: "openai", model: "gpt-4", temperature: 0.7 },
      tools: {},
      logLevel: "info",
    });

    const turn = new TurnContext({ turnId: "t1", agent, session });

    turn.addMessage({ role: "user", content: "hello" });
    turn.addToolResult({ output: "result" });
    turn.addPromptFragment({ role: "system", content: "You are helpful." });

    expect(turn.messages).toHaveLength(1);
    expect(turn.toolResults).toHaveLength(1);
    expect(turn.promptFragments).toHaveLength(1);
  });
});

describe("HandlerContext", () => {
  it("is a composite of agent, session, and turn", () => {
    const agent = new AgentContext({ llm: stubLLMProvider(), tools: new Map() });
    const session = new SessionContext({
      sessionId: "s1",
      llm: { provider: "openai", model: "gpt-4", temperature: 0.7 },
      tools: {},
      logLevel: "info",
    });
    const turn = new TurnContext({ turnId: "t1", agent, session });

    const ctx = new HandlerContext({ agent, session, turn });

    expect(ctx.agent).toBe(agent);
    expect(ctx.session).toBe(session);
    expect(ctx.turn).toBe(turn);
  });

  it("freeze() returns a FrozenContext with timestamp and checksum", () => {
    const agent = new AgentContext({ llm: stubLLMProvider(), tools: new Map() });
    const session = new SessionContext({
      sessionId: "s1",
      llm: { provider: "openai", model: "gpt-4", temperature: 0.7 },
      tools: {},
      logLevel: "info",
    });
    const turn = new TurnContext({ turnId: "t1", agent, session });
    const ctx = new HandlerContext({ agent, session, turn });

    const frozen = ctx.freeze();

    expect(frozen).toBeInstanceOf(FrozenContext);
    expect(frozen.timestamp).toBeTypeOf("number");
    expect(frozen.checksum).toBeTypeOf("string");
    expect(frozen.checksum.length).toBeGreaterThan(0);
  });
});

describe("FrozenContext", () => {
  it("is JSON-serializable (no function references)", () => {
    const agent = new AgentContext({ llm: stubLLMProvider(), tools: new Map() });
    const session = new SessionContext({
      sessionId: "s1",
      llm: { provider: "openai", model: "gpt-4", temperature: 0.7 },
      tools: {},
      logLevel: "info",
    });
    const turn = new TurnContext({ turnId: "t1", agent, session });
    const ctx = new HandlerContext({ agent, session, turn });

    const frozen = ctx.freeze();
    const json = JSON.stringify(frozen);
    const parsed = JSON.parse(json);

    expect(parsed.sessionId).toBe("s1");
    expect(parsed.turnId).toBe("t1");
  });

  it("checksum changes when context data changes", () => {
    const agent = new AgentContext({ llm: stubLLMProvider(), tools: new Map() });

    const session1 = new SessionContext({
      sessionId: "s1",
      llm: { provider: "openai", model: "gpt-4", temperature: 0.7 },
      tools: {},
      logLevel: "info",
    });
    const turn1 = new TurnContext({ turnId: "t1", agent, session: session1 });
    const frozen1 = new HandlerContext({ agent, session: session1, turn: turn1 }).freeze();

    const session2 = new SessionContext({
      sessionId: "s2",
      llm: { provider: "openai", model: "gpt-4", temperature: 0.7 },
      tools: {},
      logLevel: "info",
    });
    const turn2 = new TurnContext({ turnId: "t2", agent, session: session2 });
    const frozen2 = new HandlerContext({ agent, session: session2, turn: turn2 }).freeze();

    expect(frozen1.checksum).not.toBe(frozen2.checksum);
  });

  it("checksum is deterministic for same data", () => {
    const agent = new AgentContext({ llm: stubLLMProvider(), tools: new Map() });
    const session = new SessionContext({
      sessionId: "s1",
      llm: { provider: "openai", model: "gpt-4", temperature: 0.7 },
      tools: {},
      logLevel: "info",
    });
    const turn = new TurnContext({ turnId: "t1", agent, session });
    const ctx = new HandlerContext({ agent, session, turn });

    // Freeze twice with same timestamp override
    const frozen1 = ctx.freeze(1000);
    const frozen2 = ctx.freeze(1000);

    expect(frozen1.checksum).toBe(frozen2.checksum);
  });

  it("exposes snapshot data as read-only properties", () => {
    const agent = new AgentContext({ llm: stubLLMProvider(), tools: new Map() });
    const session = new SessionContext({
      sessionId: "s1",
      llm: { provider: "openai", model: "gpt-4", temperature: 0.7 },
      tools: {},
      logLevel: "info",
    });
    const turn = new TurnContext({ turnId: "t1", agent, session });
    turn.addMessage({ role: "user", content: "test" });

    const frozen = new HandlerContext({ agent, session, turn }).freeze();

    expect(frozen.sessionId).toBe("s1");
    expect(frozen.turnId).toBe("t1");
    expect(frozen.messages).toHaveLength(1);
    expect(frozen.messages[0].content).toBe("test");
  });
});
