import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SqliteCheckpointStore } from "./sqlite-checkpoint-store.js";
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

// --- Sessions ---
describe("SqliteCheckpointStore — sessions", () => {
  it("createSession / loadSession round-trip", () => {
    const store = new SqliteCheckpointStore(":memory:");
    store.createSession({ sessionId: "s1", config: testConfig });
    const loaded = store.loadSession("s1");
    expect(loaded).toBeDefined();
    expect(loaded!.sessionId).toBe("s1");
    expect(loaded!.config.llm.model).toBe("gpt-4");
    store.close();
  });

  it("loadSession returns undefined for missing id", () => {
    const store = new SqliteCheckpointStore(":memory:");
    expect(store.loadSession("missing")).toBeUndefined();
    store.close();
  });

  it("updateSession patches fields", () => {
    const store = new SqliteCheckpointStore(":memory:");
    store.createSession({ sessionId: "s1", config: testConfig });
    store.updateSession("s1", { config: { ...testConfig, logLevel: "debug" } });
    expect(store.loadSession("s1")!.config.logLevel).toBe("debug");
    store.close();
  });
});

// --- Messages ---
describe("SqliteCheckpointStore — messages", () => {
  it("addMessages / loadMessages round-trip", () => {
    const store = new SqliteCheckpointStore(":memory:");
    store.createSession({ sessionId: "s1", config: testConfig });
    store.addMessages("s1", [{ role: "user", content: "hello" }, { role: "assistant", content: "hi" }]);
    const msgs = store.loadMessages("s1");
    expect(msgs).toHaveLength(2);
    expect(msgs[0].content).toBe("hello");
    store.close();
  });

  it("loadMessages returns empty array for missing session", () => {
    const store = new SqliteCheckpointStore(":memory:");
    expect(store.loadMessages("missing")).toEqual([]);
    store.close();
  });
});

// --- Checkpoints ---
describe("SqliteCheckpointStore — checkpoints", () => {
  it("saveCheckpoint / loadLatestCheckpoint round-trip", () => {
    const store = new SqliteCheckpointStore(":memory:");
    const frozen = makeFrozen("s1", "t1");
    store.saveCheckpoint(frozen);
    const loaded = store.loadLatestCheckpoint("s1");
    expect(loaded).toBeDefined();
    expect(loaded!.turnId).toBe("t1");
    expect(loaded!.checksum).toBe(frozen.checksum);
    store.close();
  });

  it("loadCheckpoint by turnId", () => {
    const store = new SqliteCheckpointStore(":memory:");
    store.saveCheckpoint(makeFrozen("s1", "t1"));
    store.saveCheckpoint(makeFrozen("s1", "t2"));
    const loaded = store.loadCheckpoint("s1", "t1");
    expect(loaded!.turnId).toBe("t1");
    store.close();
  });

  it("loadLatestCheckpoint returns undefined for empty session", () => {
    const store = new SqliteCheckpointStore(":memory:");
    expect(store.loadLatestCheckpoint("missing")).toBeUndefined();
    store.close();
  });
});

// --- Event Log ---
describe("SqliteCheckpointStore — event log", () => {
  it("appendEvent / queryEvents round-trip", () => {
    const store = new SqliteCheckpointStore(":memory:");
    store.appendEvent({ sessionId: "s1", event: "turn:start", timestamp: 100 });
    store.appendEvent({ sessionId: "s1", event: "turn:end", timestamp: 200 });
    const events = store.queryEvents("s1");
    expect(events).toHaveLength(2);
    expect(events[0].event).toBe("turn:start");
    store.close();
  });

  it("queryEvents with since filter", () => {
    const store = new SqliteCheckpointStore(":memory:");
    store.appendEvent({ sessionId: "s1", event: "a", timestamp: 100 });
    store.appendEvent({ sessionId: "s1", event: "b", timestamp: 200 });
    store.appendEvent({ sessionId: "s1", event: "c", timestamp: 300 });
    expect(store.queryEvents("s1", 200)).toHaveLength(2);
    store.close();
  });

  it("queryEvents returns empty for missing session", () => {
    const store = new SqliteCheckpointStore(":memory:");
    expect(store.queryEvents("missing")).toEqual([]);
    store.close();
  });
});

// --- Config Snapshots ---
describe("SqliteCheckpointStore — config snapshots", () => {
  it("saveConfigSnapshot / loadLatestConfigSnapshot round-trip", () => {
    const store = new SqliteCheckpointStore(":memory:");
    store.saveConfigSnapshot({ sessionId: "s1", handlers: { name: "test" }, timestamp: 100 });
    const loaded = store.loadLatestConfigSnapshot("s1");
    expect(loaded).toBeDefined();
    expect((loaded!.handlers as any).name).toBe("test");
    store.close();
  });

  it("loadLatestConfigSnapshot returns undefined for empty session", () => {
    const store = new SqliteCheckpointStore(":memory:");
    expect(store.loadLatestConfigSnapshot("missing")).toBeUndefined();
    store.close();
  });
});

// --- Cost Records ---
describe("SqliteCheckpointStore — cost records", () => {
  it("addCostRecord / loadCostRecords round-trip", () => {
    const store = new SqliteCheckpointStore(":memory:");
    store.addCostRecord({ sessionId: "s1", turnId: "t1", promptTokens: 100, completionTokens: 50, timestamp: 100 });
    store.addCostRecord({ sessionId: "s1", turnId: "t2", promptTokens: 200, completionTokens: 80, timestamp: 200 });
    const records = store.loadCostRecords("s1");
    expect(records).toHaveLength(2);
    expect(records[0].promptTokens).toBe(100);
    expect(records[1].completionTokens).toBe(80);
    store.close();
  });

  it("loadCostRecords returns empty for missing session", () => {
    const store = new SqliteCheckpointStore(":memory:");
    expect(store.loadCostRecords("missing")).toEqual([]);
    store.close();
  });
});

// --- Tracer bullet ---
describe("SqliteCheckpointStore — creation and schema", () => {
  it("creates all 6 tables on initialization", () => {
    const store = new SqliteCheckpointStore(":memory:");
    const tables = store.getTableNames();
    expect(tables).toContain("sessions");
    expect(tables).toContain("messages");
    expect(tables).toContain("checkpoints");
    expect(tables).toContain("event_log");
    expect(tables).toContain("config_snapshots");
    expect(tables).toContain("cost_records");
    store.close();
  });

  it("enables WAL mode", () => {
    const dir = mkdtempSync(join(tmpdir(), "proteus-test-"));
    const store = new SqliteCheckpointStore(join(dir, "test.db"));
    const mode = store.getJournalMode();
    expect(mode).toBe("wal");
    store.close();
    rmSync(dir, { recursive: true, force: true });
  });
});
