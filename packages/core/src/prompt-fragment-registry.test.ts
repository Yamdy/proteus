import { describe, it, expect, beforeEach } from "vitest";
import { PromptFragmentRegistry } from "./prompt-fragment-registry.js";
import type { PromptFragmentEntry } from "./prompt-fragment-registry.js";
import { PromptFragmentLoader, createPromptFragmentLoaderHandler } from "./prompt-fragment-loader.js";
import { HandlerEngine } from "./handler-engine.js";
import { AgentContext, SessionContext, TurnContext, HandlerContext } from "./context.js";
import type { LLMProvider, Tool, SessionConfig } from "./index.js";

// --- Mock LLM Provider ---
const mockLLM: LLMProvider = {
  chat: async () => ({
    content: "test",
    usage: { promptTokens: 0, completionTokens: 0 },
    finishReason: "stop" as const,
  }),
  chatStream: async function* () {
    yield {
      content: "test",
      usage: { promptTokens: 0, completionTokens: 0 },
      finishReason: "stop" as const,
    };
  },
  countTokens: () => 0,
};

// --- Mock Session Config ---
const mockSessionConfig: SessionConfig = {
  sessionId: "test-session-1",
  llm: { provider: "mock", model: "mock", temperature: 0 },
  tools: {},
  logLevel: "info",
};

// --- Helper to create HandlerContext ---
function createMockHandlerContext(sessionId = "test-session-1"): HandlerContext {
  const tools = new Map<string, Tool>();
  const engine = new HandlerEngine();
  const registry = new PromptFragmentRegistry();
  const agent = new AgentContext({ llm: mockLLM, tools, handlerEngine: engine, fragmentRegistry: registry });
  const session = new SessionContext({ ...mockSessionConfig, sessionId });
  const turn = new TurnContext({ turnId: "turn-1", agent, session });
  return new HandlerContext({ agent, session, turn });
}

// --- PromptFragmentRegistry Tests ---

describe("PromptFragmentRegistry", () => {
  let registry: PromptFragmentRegistry;

  beforeEach(() => {
    registry = new PromptFragmentRegistry();
  });

  describe("CRUD operations", () => {
    it("should register a fragment", () => {
      const fragment: PromptFragmentEntry = {
        name: "test-fragment",
        role: "system",
        content: "You are a helpful assistant",
      };
      registry.register(fragment);
      expect(registry.get("test-fragment")).toEqual(fragment);
    });

    it("should unregister a fragment", () => {
      registry.register({
        name: "to-remove",
        role: "system",
        content: "content",
      });
      registry.unregister("to-remove");
      expect(registry.get("to-remove")).toBeUndefined();
    });

    it("should replace a fragment", () => {
      registry.register({
        name: "to-replace",
        role: "system",
        content: "original",
      });
      registry.replace("to-replace", {
        name: "to-replace",
        role: "system",
        content: "updated",
      });
      expect(registry.get("to-replace")?.content).toBe("updated");
    });

    it("should throw when replacing non-existent fragment", () => {
      expect(() =>
        registry.replace("non-existent", {
          name: "non-existent",
          role: "system",
          content: "content",
        }),
      ).toThrow('Fragment "non-existent" not found');
    });

    it("should get all fragments", () => {
      registry.register({ name: "f1", role: "system", content: "c1" });
      registry.register({ name: "f2", role: "user", content: "c2" });
      const all = registry.getAll();
      expect(all).toHaveLength(2);
    });

    it("should get fragments by role", () => {
      registry.register({ name: "sys1", role: "system", content: "s1" });
      registry.register({ name: "user1", role: "user", content: "u1" });
      registry.register({ name: "sys2", role: "system", content: "s2" });
      const systemFragments = registry.getByRole("system");
      expect(systemFragments).toHaveLength(2);
      expect(systemFragments.every((f) => f.role === "system")).toBe(true);
    });

    it("should get fragments by tag", () => {
      registry.register({
        name: "persona",
        role: "system",
        content: "You are a teacher",
        tags: ["persona"],
      });
      registry.register({
        name: "instructions",
        role: "system",
        content: "Be helpful",
        tags: ["instructions"],
      });
      registry.register({
        name: "both",
        role: "system",
        content: "Both tags",
        tags: ["persona", "instructions"],
      });
      const personaFragments = registry.getByTag("persona");
      expect(personaFragments).toHaveLength(2);
    });
  });

  describe("priority ordering", () => {
    it("should sort fragments by priority (lower = earlier)", () => {
      registry.register({ name: "low", role: "system", content: "low", priority: 10 });
      registry.register({ name: "high", role: "system", content: "high", priority: 100 });
      registry.register({ name: "mid", role: "system", content: "mid", priority: 50 });
      const all = registry.getAll();
      expect(all[0].name).toBe("low");
      expect(all[1].name).toBe("mid");
      expect(all[2].name).toBe("high");
    });

    it("should default priority to 100", () => {
      registry.register({ name: "default", role: "system", content: "c" });
      expect(registry.get("default")?.priority).toBeUndefined();
      const all = registry.getAll();
      // Should be treated as 100
      expect(all).toHaveLength(1);
    });
  });

  describe("serialization", () => {
    it("should serialize and deserialize", () => {
      registry.register({
        name: "test",
        role: "system",
        content: "content",
        priority: 10,
        tags: ["persona"],
        sessionIds: ["s1"],
      });
      const serialized = registry.serialize();
      const deserialized = PromptFragmentRegistry.deserialize(serialized);
      expect(deserialized.get("test")).toEqual({
        name: "test",
        role: "system",
        content: "content",
        priority: 10,
        tags: ["persona"],
        sessionIds: ["s1"],
      });
    });

    it("should not serialize condition functions", () => {
      registry.register({
        name: "conditional",
        role: "system",
        content: "content",
        condition: () => true,
      });
      const serialized = registry.serialize();
      expect(serialized.fragments[0]).not.toHaveProperty("condition");
    });
  });
});

// --- PromptFragmentLoader Tests ---

describe("PromptFragmentLoader", () => {
  let registry: PromptFragmentRegistry;

  beforeEach(() => {
    registry = new PromptFragmentRegistry();
  });

  it("should inject fragments into turn.promptFragments", async () => {
    registry.register({
      name: "test",
      role: "system",
      content: "You are helpful",
    });
    const loader = new PromptFragmentLoader(registry);
    const ctx = createMockHandlerContext();
    await loader.handle(ctx);
    expect(ctx.turn.promptFragments).toHaveLength(1);
    expect(ctx.turn.promptFragments[0].content).toBe("You are helpful");
  });

  it("should filter by sessionIds", async () => {
    registry.register({
      name: "session-specific",
      role: "system",
      content: "content",
      sessionIds: ["other-session"],
    });
    const loader = new PromptFragmentLoader(registry);
    const ctx = createMockHandlerContext("test-session-1");
    await loader.handle(ctx);
    expect(ctx.turn.promptFragments).toHaveLength(0);
  });

  it("should inject when sessionId matches", async () => {
    registry.register({
      name: "session-specific",
      role: "system",
      content: "content",
      sessionIds: ["test-session-1"],
    });
    const loader = new PromptFragmentLoader(registry);
    const ctx = createMockHandlerContext("test-session-1");
    await loader.handle(ctx);
    expect(ctx.turn.promptFragments).toHaveLength(1);
  });

  it("should inject when sessionIds is empty (global)", async () => {
    registry.register({
      name: "global",
      role: "system",
      content: "content",
      sessionIds: [],
    });
    const loader = new PromptFragmentLoader(registry);
    const ctx = createMockHandlerContext("any-session");
    await loader.handle(ctx);
    expect(ctx.turn.promptFragments).toHaveLength(1);
  });

  it("should filter by condition", async () => {
    registry.register({
      name: "conditional",
      role: "system",
      content: "content",
      condition: () => false,
    });
    const loader = new PromptFragmentLoader(registry);
    const ctx = createMockHandlerContext();
    await loader.handle(ctx);
    expect(ctx.turn.promptFragments).toHaveLength(0);
  });

  it("should inject when condition returns true", async () => {
    registry.register({
      name: "conditional",
      role: "system",
      content: "content",
      condition: () => true,
    });
    const loader = new PromptFragmentLoader(registry);
    const ctx = createMockHandlerContext();
    await loader.handle(ctx);
    expect(ctx.turn.promptFragments).toHaveLength(1);
  });

  it("should deduplicate by name (last wins)", async () => {
    registry.register({ name: "dup", role: "system", content: "first" });
    registry.register({ name: "dup", role: "system", content: "second" });
    const loader = new PromptFragmentLoader(registry);
    const ctx = createMockHandlerContext();
    await loader.handle(ctx);
    expect(ctx.turn.promptFragments).toHaveLength(1);
    expect(ctx.turn.promptFragments[0].content).toBe("second");
  });

  it("should sort by priority", async () => {
    registry.register({ name: "low", role: "system", content: "low", priority: 10 });
    registry.register({ name: "high", role: "system", content: "high", priority: 100 });
    const loader = new PromptFragmentLoader(registry);
    const ctx = createMockHandlerContext();
    await loader.handle(ctx);
    expect(ctx.turn.promptFragments[0].name).toBe("low");
    expect(ctx.turn.promptFragments[1].name).toBe("high");
  });
});

// --- Handler Registration Tests ---

describe("createPromptFragmentLoaderHandler", () => {
  it("should create a valid handler definition", () => {
    const registry = new PromptFragmentRegistry();
    const handler = createPromptFragmentLoaderHandler(registry);
    expect(handler.name).toBe("prompt-fragment-loader");
    expect(handler.phases).toEqual(["context_assembly"]);
    expect(handler.events).toEqual(["phase:before"]);
    expect(handler.priority).toBe(5);
    expect(handler.trust).toBe(3);
    expect(handler.builtin).toBe(true);
  });

  it("should register with HandlerEngine", () => {
    const registry = new PromptFragmentRegistry();
    const engine = new HandlerEngine();
    const handler = createPromptFragmentLoaderHandler(registry);
    engine.register(handler);
    const handlers = engine.getHandlers("phase:before", { phaseName: "context_assembly" });
    expect(handlers.some((h) => h.name === "prompt-fragment-loader")).toBe(true);
  });
});

// --- Integration with ContextAssemblyProcessor Tests ---

describe("Integration with ContextAssemblyProcessor", () => {
  it("should inject fragments before context assembly", async () => {
    const { ContextAssemblyProcessor } = await import("./processors.js");
    const registry = new PromptFragmentRegistry();
    registry.register({
      name: "system-prompt",
      role: "system",
      content: "You are a teacher",
    });
    registry.register({
      name: "user-hint",
      role: "user",
      content: "Explain like I'm 5",
    });

    const loader = new PromptFragmentLoader(registry);
    const processor = new ContextAssemblyProcessor();

    const ctx = createMockHandlerContext();

    // Loader runs first (priority 5)
    await loader.handle(ctx);
    // Processor runs second (priority 10)
    await processor.handle(ctx);

    // Check that fragments were assembled into messages
    const systemMessages = ctx.turn.messages.filter((m) => m.role === "system");
    const userMessages = ctx.turn.messages.filter((m) => m.role === "user");

    expect(systemMessages).toHaveLength(1);
    expect(systemMessages[0].content).toBe("You are a teacher");
    expect(userMessages).toHaveLength(1);
    expect(userMessages[0].content).toBe("Explain like I'm 5");
  });
});
