import { describe, it, expect } from "vitest";
import { createInMemoryStore } from "./checkpoint-store.js";
import { AgentContext, SessionContext, TurnContext, HandlerContext, FrozenContext } from "./context.js";
import type { LLMProvider } from "./index.js";

function stubLLM(): LLMProvider {
  return {
    chat: async () => ({ content: "", usage: { promptTokens: 0, completionTokens: 0 }, finishReason: "stop" as const }),
    chatStream: async function* () {},
    countTokens: () => 0,
  };
}

function makeFrozen(sessionId: string, turnId: string): FrozenContext {
  const agent = new AgentContext({ llm: stubLLM(), tools: new Map() });
  const session = new SessionContext({ sessionId, llm: { provider: "openai", model: "gpt-4", temperature: 0.7 }, tools: {}, logLevel: "info" });
  const turn = new TurnContext({ turnId, agent, session });
  return new HandlerContext({ agent, session, turn }).freeze(1000);
}

const testConfig = { sessionId: "s1", llm: { provider: "openai", model: "gpt-4", temperature: 0.7 }, tools: {}, logLevel: "info" as const };

describe("CheckpointStore — sessions", () => {
  it("createSession / loadSession round-trip", () => {
    const store = createInMemoryStore();
    store.createSession({ sessionId: "s1", config: testConfig });

    const loaded = store.loadSession("s1");
    expect(loaded).toBeDefined();
    expect(loaded!.sessionId).toBe("s1");
  });

  it("loadSession returns undefined for missing id", () => {
    const store = createInMemoryStore();
    expect(store.loadSession("missing")).toBeUndefined();
  });

  it("updateSession patches fields", () => {
    const store = createInMemoryStore();
    store.createSession({ sessionId: "s1", config: testConfig });
    store.updateSession("s1", { config: { ...testConfig, logLevel: "debug" } });

    expect(store.loadSession("s1")!.config.logLevel).toBe("debug");
  });

  it("deleteSession removes session", () => {
    const store = createInMemoryStore();
    store.createSession({ sessionId: "s1", config: testConfig });
    store.deleteSession("s1");
    expect(store.loadSession("s1")).toBeUndefined();
    expect(store.listSessions()).toEqual([]);
  });

  it("deleteSession on missing id is a no-op", () => {
    const store = createInMemoryStore();
    expect(() => store.deleteSession("missing")).not.toThrow();
  });
});

describe("CheckpointStore — messages", () => {
  it("addMessages / loadMessages round-trip", () => {
    const store = createInMemoryStore();
    store.createSession({ sessionId: "s1", config: testConfig });
    store.addMessages("s1", [
      { role: "user", content: "hello" },
      { role: "assistant", content: "hi" },
    ]);

    const msgs = store.loadMessages("s1");
    expect(msgs).toHaveLength(2);
    expect(msgs[0].content).toBe("hello");
  });

  it("loadMessages returns empty array for missing session", () => {
    const store = createInMemoryStore();
    expect(store.loadMessages("missing")).toEqual([]);
  });
});

describe("CheckpointStore — checkpoints", () => {
  it("saveCheckpoint / loadLatestCheckpoint round-trip", () => {
    const store = createInMemoryStore();
    const frozen = makeFrozen("s1", "t1");
    store.saveCheckpoint(frozen);

    const loaded = store.loadLatestCheckpoint("s1");
    expect(loaded).toBeDefined();
    expect(loaded!.turnId).toBe("t1");
    expect(loaded!.checksum).toBe(frozen.checksum);
  });

  it("loadCheckpoint by turnId", () => {
    const store = createInMemoryStore();
    store.saveCheckpoint(makeFrozen("s1", "t1"));
    store.saveCheckpoint(makeFrozen("s1", "t2"));

    const loaded = store.loadCheckpoint("s1", "t1");
    expect(loaded!.turnId).toBe("t1");
  });

  it("loadLatestCheckpoint returns undefined for empty session", () => {
    const store = createInMemoryStore();
    expect(store.loadLatestCheckpoint("missing")).toBeUndefined();
  });
});

describe("CheckpointStore — event log", () => {
  it("appendEvent / queryEvents round-trip", () => {
    const store = createInMemoryStore();
    store.appendEvent({ sessionId: "s1", event: "turn:start", timestamp: 100 });
    store.appendEvent({ sessionId: "s1", event: "turn:end", timestamp: 200 });

    const events = store.queryEvents("s1");
    expect(events).toHaveLength(2);
    expect(events[0].event).toBe("turn:start");
  });

  it("queryEvents with since filter", () => {
    const store = createInMemoryStore();
    store.appendEvent({ sessionId: "s1", event: "a", timestamp: 100 });
    store.appendEvent({ sessionId: "s1", event: "b", timestamp: 200 });
    store.appendEvent({ sessionId: "s1", event: "c", timestamp: 300 });

    expect(store.queryEvents("s1", 200)).toHaveLength(2);
  });

  it("queryEvents returns empty for missing session", () => {
    const store = createInMemoryStore();
    expect(store.queryEvents("missing")).toEqual([]);
  });
});

describe("CheckpointStore — config snapshots", () => {
  it("saveConfigSnapshot / loadLatestConfigSnapshot round-trip", () => {
    const store = createInMemoryStore();
    store.saveConfigSnapshot({ sessionId: "s1", handlers: { name: "test" }, timestamp: 100 });

    const loaded = store.loadLatestConfigSnapshot("s1");
    expect(loaded).toBeDefined();
    expect((loaded!.handlers as any).name).toBe("test");
  });

  it("loadLatestConfigSnapshot returns undefined for empty session", () => {
    const store = createInMemoryStore();
    expect(store.loadLatestConfigSnapshot("missing")).toBeUndefined();
  });
});

describe("CheckpointStore — cost records", () => {
  it("addCostRecord / loadCostRecords round-trip", () => {
    const store = createInMemoryStore();
    store.addCostRecord({ sessionId: "s1", turnId: "t1", promptTokens: 100, completionTokens: 50, timestamp: 100 });
    store.addCostRecord({ sessionId: "s1", turnId: "t2", promptTokens: 200, completionTokens: 80, timestamp: 200 });

    const records = store.loadCostRecords("s1");
    expect(records).toHaveLength(2);
    expect(records[0].promptTokens).toBe(100);
    expect(records[1].completionTokens).toBe(80);
  });

  it("loadCostRecords returns empty for missing session", () => {
    const store = createInMemoryStore();
    expect(store.loadCostRecords("missing")).toEqual([]);
  });
});
