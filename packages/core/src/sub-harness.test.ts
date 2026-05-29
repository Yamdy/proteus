import { describe, it, expect } from "vitest";
import { SubHarness } from "./sub-harness.js";
import type { CompactionFn } from "./sub-harness.js";
import {
  AgentContext,
  SessionContext,
} from "./context.js";
import { InMemoryCheckpointStore } from "./checkpoint-store.js";
import { HandlerEngine } from "./handler-engine.js";
import type { LLMProvider, LLMMessage } from "./index.js";

function stubLLM(): LLMProvider {
  return {
    chat: async () => ({
      content: "ok",
      usage: { promptTokens: 10, completionTokens: 5 },
      finishReason: "stop" as const,
    }),
    chatStream: async function* () {},
    countTokens: () => 0,
  };
}

function makeParentSession(sessionId = "parent-1") {
  return new SessionContext({
    sessionId,
    llm: { provider: "test", model: "stub", temperature: 0 },
    tools: {},
    logLevel: "info",
  });
}

/**
 * Agent with a handler that simulates LLM cost tracking.
 * The handler accesses session from the HandlerContext emitted by the Harness.
 */
function makeAgent() {
  const engine = new HandlerEngine();
  // Simulate what LLMInferenceProcessor does: add usage to session cost tracker
  engine.register({
    name: "cost-tracker",
    phases: ["llm_inference"],
    trust: 3,
    builtin: true,
    handle: async (ctx: any) => {
      const session = ctx.session ?? ctx.turn?.session;
      if (session?.costTracker) {
        session.costTracker.addUsage({ promptTokens: 10, completionTokens: 5 });
      }
      return { ok: true };
    },
  });
  return new AgentContext({
    llm: stubLLM(),
    tools: new Map(),
    handlerEngine: engine,
  });
}

const stubCompact: CompactionFn = (messages: LLMMessage[]) => {
  const system = messages.filter((m) => m.role === "system");
  const nonSystem = messages.filter((m) => m.role !== "system");
  if (nonSystem.length === 0) return [...system];
  return [
    ...system,
    { role: "assistant" as const, content: `[compacted: ${nonSystem.length} messages]` },
  ];
};

describe("SubHarness", () => {
  it("full mode: child has independent WorkingMemory", async () => {
    const parentSession = makeParentSession();
    parentSession.workingMemory.push({ role: "user", content: "parent msg" });

    const harness = new SubHarness({
      parentSession,
      parentAgent: makeAgent(),
      isolation: "full",
      store: new InMemoryCheckpointStore(),
    });

    const result = await harness.runChild(makeAgent());
    expect(result.status).toBe("completed");
  });

  it("shared mode: child sees parent messages", async () => {
    const parentSession = makeParentSession();
    parentSession.workingMemory.push({ role: "user", content: "hello from parent" });

    const harness = new SubHarness({
      parentSession,
      parentAgent: makeAgent(),
      isolation: "shared",
      store: new InMemoryCheckpointStore(),
    });

    const result = await harness.runChild(makeAgent());
    expect(result.status).toBe("completed");
  });

  it("summary mode: compacts parent messages before passing to child", async () => {
    const parentSession = makeParentSession();
    parentSession.workingMemory.push({ role: "user", content: "msg1" });
    parentSession.workingMemory.push({ role: "assistant", content: "msg2" });
    parentSession.workingMemory.push({ role: "user", content: "msg3" });

    const harness = new SubHarness({
      parentSession,
      parentAgent: makeAgent(),
      isolation: "summary",
      store: new InMemoryCheckpointStore(),
      compact: stubCompact,
    });

    const result = await harness.runChild(makeAgent());
    expect(result.status).toBe("completed");
  });

  it("summary mode throws if compact function not provided", async () => {
    const parentSession = makeParentSession();

    const harness = new SubHarness({
      parentSession,
      parentAgent: makeAgent(),
      isolation: "summary",
      store: new InMemoryCheckpointStore(),
    });

    await expect(harness.runChild(makeAgent())).rejects.toThrow(
      "compact function required",
    );
  });

  it("child cost merges into parent CostTracker", async () => {
    const parentSession = makeParentSession();
    const parentBefore = parentSession.costTracker.getTotals();

    const harness = new SubHarness({
      parentSession,
      parentAgent: makeAgent(),
      isolation: "full",
      store: new InMemoryCheckpointStore(),
    });

    await harness.runChild(makeAgent());

    const parentAfter = parentSession.costTracker.getTotals();
    expect(parentAfter.promptTokens).toBeGreaterThan(parentBefore.promptTokens);
    expect(parentAfter.completionTokens).toBeGreaterThan(parentBefore.completionTokens);
  });

  it("SubHarnessResult has correct shape", async () => {
    const parentSession = makeParentSession();

    const harness = new SubHarness({
      parentSession,
      parentAgent: makeAgent(),
      isolation: "full",
      store: new InMemoryCheckpointStore(),
    });

    const result = await harness.runChild(makeAgent());
    expect(result.status).toMatch(/^(completed|aborted|errored)$/);
    expect(result.childSessionId).toMatch(/^child_/);
    expect(result.usage).toHaveProperty("promptTokens");
    expect(result.usage).toHaveProperty("completionTokens");
  });
});
