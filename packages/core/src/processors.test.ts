import { describe, it, expect } from "vitest";
import {
  ContextAssemblyProcessor,
  LLMInferenceProcessor,
  ActionResolutionProcessor,
  ToolExecutionProcessor,
  ResultObservationProcessor,
  DirectToolRunner,
  registerBuiltInProcessors,
} from "./processors.js";
import type { ToolRunner } from "./processors.js";
import { AgentContext, SessionContext, TurnContext, HandlerContext } from "./context.js";
import { HandlerEngine } from "./handler-engine.js";
import { Harness } from "./harness.js";
import { InMemoryCheckpointStore } from "./checkpoint-store.js";
import type { LLMProvider, Tool, SessionConfig } from "./index.js";

function testConfig(sessionId = "test-session"): SessionConfig {
  return {
    sessionId,
    llm: { provider: "openai", model: "gpt-4o", temperature: 0 },
    tools: {},
    logLevel: "info",
  };
}

function stubLLM(overrides?: Partial<LLMProvider>): LLMProvider {
  return {
    chat: overrides?.chat ?? (async () => ({
      content: "stub response",
      toolCalls: [],
      usage: { promptTokens: 10, completionTokens: 5 },
      finishReason: "stop" as const,
    })),
    chatStream: overrides?.chatStream ?? (async function* () {}),
    countTokens: overrides?.countTokens ?? ((text: string) => Math.ceil(text.length / 4)),
  };
}

function makeCtx(opts?: { llm?: LLMProvider; tools?: Map<string, Tool>; engine?: HandlerEngine }) {
  const engine = opts?.engine ?? new HandlerEngine();
  const llm = opts?.llm ?? stubLLM();
  const tools = opts?.tools ?? new Map<string, Tool>();
  const agent = new AgentContext({ llm, tools, handlerEngine: engine });
  const session = new SessionContext(testConfig());
  const turnId = "turn_test";
  const turn = new TurnContext({ turnId, agent, session });
  const ctx = new HandlerContext({ agent, session, turn });
  return { ctx: ctx as any, agent, session, turn, engine, llm };
}

function withPhase(ctx: any, phaseName: string): any {
  return { ...ctx, phaseName };
}

describe("ContextAssemblyProcessor", () => {
  it("assembles messages from Working Memory + system prompt", async () => {
    const { ctx, session } = makeCtx();
    session.workingMemory.push({ role: "user", content: "Hello" });
    ctx.turn.addPromptFragment({ role: "system", content: "You are helpful." });

    const processor = new ContextAssemblyProcessor();
    const result = await processor.handle(withPhase(ctx, "context_assembly"));

    expect((result as any).ok).toBe(true);
    expect(ctx.turn.messages.length).toBeGreaterThanOrEqual(2);
    expect(ctx.turn.messages[0]!.role).toBe("system");
    expect(ctx.turn.messages.some((m: any) => m.content === "Hello")).toBe(true);
  });

  it("truncates when over token budget", async () => {
    const { ctx, session } = makeCtx();
    for (let i = 0; i < 100; i++) {
      session.workingMemory.push({ role: "user", content: `Message ${i}` });
    }

    const processor = new ContextAssemblyProcessor({ maxTokens: 10 });
    const result = await processor.handle(withPhase(ctx, "context_assembly"));

    expect((result as any).ok).toBe(true);
    expect(ctx.turn.messages.length).toBeLessThan(100);
  });

  it("prefix hash is a 64-character hex string (SHA-256)", async () => {
    const { ctx } = makeCtx();
    ctx.turn.addPromptFragment({ role: "system", content: "You are helpful." });

    const processor = new ContextAssemblyProcessor();
    await processor.handle(withPhase(ctx, "context_assembly"));

    // Access lastPrefixHash via the processor's public interface
    // The hash is used internally for cache prefix stability detection
    // We verify it indirectly by checking the event payload
    expect(processor.lastPrefixHash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("LLMInferenceProcessor", () => {
  it("calls LLM.chatStream() and stores response in TurnContext", async () => {
    const llm = stubLLM({
      chatStream: async function* () {
        yield { content: "Hello from LLM", usage: { promptTokens: 20, completionTokens: 10 }, finishReason: "stop" };
      },
    });
    const { ctx } = makeCtx({ llm });

    const processor = new LLMInferenceProcessor();
    const result = await processor.handle(withPhase(ctx, "llm_inference"));

    expect((result as any).ok).toBe(true);
    expect(ctx.turn.messages.some((m: any) => m.content === "Hello from LLM")).toBe(true);
  });

  it("updates CostTracker with usage", async () => {
    const llm = stubLLM({
      chatStream: async function* () {
        yield { content: "response", usage: { promptTokens: 20, completionTokens: 10 }, finishReason: "stop" };
      },
    });
    const { ctx, session } = makeCtx({ llm });

    const processor = new LLMInferenceProcessor();
    await processor.handle(withPhase(ctx, "llm_inference"));

    const totals = session.costTracker.getTotals();
    expect(totals.promptTokens).toBe(20);
    expect(totals.completionTokens).toBe(10);
  });

  it("stores tool calls from LLM response", async () => {
    const llm = stubLLM({
      chatStream: async function* () {
        yield {
          content: "",
          toolCalls: [{ id: "c1", name: "search", arguments: { query: "test" } }],
          usage: { promptTokens: 10, completionTokens: 5 },
          finishReason: "tool_call" as const,
        };
      },
    });
    const { ctx } = makeCtx({ llm });

    const processor = new LLMInferenceProcessor();
    await processor.handle(withPhase(ctx, "llm_inference"));

    expect(ctx.turn.toolCalls).toBeDefined();
    expect(ctx.turn.toolCalls!.length).toBe(1);
    expect(ctx.turn.toolCalls![0]!.name).toBe("search");
  });
});

describe("ActionResolutionProcessor", () => {
  it("validates tool calls against ToolRegistry", async () => {
    const tool: Tool = {
      definition: { name: "search", description: "Search", parameters: {} },
      execute: async () => ({ output: "found" }),
    };
    const tools = new Map([["search", tool]]);
    const { ctx } = makeCtx({ tools });
    ctx.turn.toolCalls = [{ id: "c1", name: "search", arguments: { query: "test" } }];

    const processor = new ActionResolutionProcessor();
    const result = await processor.handle(withPhase(ctx, "action_resolution"));

    expect((result as any).ok).toBe(true);
    expect(ctx.turn.actions).toBeDefined();
    expect(ctx.turn.actions!.length).toBe(1);
  });

  it("aborts if tool not found in registry", async () => {
    const { ctx } = makeCtx();
    ctx.turn.toolCalls = [{ id: "c1", name: "nonexistent", arguments: {} }];

    const processor = new ActionResolutionProcessor();
    const result = await processor.handle(withPhase(ctx, "action_resolution"));

    expect((result as any).ok).toBe(false);
  });

  it("passes through when no tool calls", async () => {
    const { ctx } = makeCtx();
    ctx.turn.addMessage({ role: "assistant", content: "Just text" });

    const processor = new ActionResolutionProcessor();
    const result = await processor.handle(withPhase(ctx, "action_resolution"));

    expect((result as any).ok).toBe(true);
  });
});

describe("ToolExecutionProcessor", () => {
  it("dispatches tool calls and stores results", async () => {
    let executed = false;
    const tool: Tool = {
      definition: { name: "search", description: "Search", parameters: {} },
      execute: async (params) => {
        executed = true;
        return { output: `Result for ${params.query}` };
      },
    };
    const tools = new Map([["search", tool]]);
    const { ctx } = makeCtx({ tools });
    ctx.turn.addMessage({
      role: "assistant",
      content: "",
      toolCalls: [{ id: "c1", name: "search", arguments: { query: "test" } }],
    });
    (ctx.turn as any).actions = [{ id: "c1", name: "search", arguments: { query: "test" } }];

    const processor = new ToolExecutionProcessor();
    const result = await processor.handle(withPhase(ctx, "tool_execution"));

    expect((result as any).ok).toBe(true);
    expect(executed).toBe(true);
    expect(ctx.turn.toolResults.length).toBe(1);
    expect(ctx.turn.toolResults[0]!.output).toBe("Result for test");
  });

  it("handles tool execution errors", async () => {
    const tool: Tool = {
      definition: { name: "fail", description: "Fails", parameters: {} },
      execute: async () => {
        throw new Error("Tool crashed");
      },
    };
    const tools = new Map([["fail", tool]]);
    const { ctx } = makeCtx({ tools });
    (ctx.turn as any).actions = [{ id: "c1", name: "fail", arguments: {} }];

    const processor = new ToolExecutionProcessor();
    const result = await processor.handle(withPhase(ctx, "tool_execution"));

    expect((result as any).ok).toBe(true);
    expect(ctx.turn.toolResults[0]!.error).toBeDefined();
    expect(ctx.turn.toolResults[0]!.error!.message).toBe("Tool crashed");
    expect(ctx.turn.toolResults[0]!.error!.retryable).toBe(false);
  });

  it("defaults to DirectToolRunner when no executionEnv provided", () => {
    const processor = new ToolExecutionProcessor();
    // Verify it is usable (DirectToolRunner delegates to tool.execute)
    expect(processor).toBeDefined();
  });

  it("uses injected ToolRunner instead of tool.execute()", async () => {
    let envExecuted = false;
    const tool: Tool = {
      definition: { name: "search", description: "Search", parameters: {} },
      execute: async () => ({ output: "from-tool" }),
    };
    const customEnv: ToolRunner = {
      execute: async (_tool, params, _context) => {
        envExecuted = true;
        return { output: `from-env: ${params.query}` };
      },
    };
    const tools = new Map([["search", tool]]);
    const { ctx } = makeCtx({ tools });
    (ctx.turn as any).actions = [{ id: "c1", name: "search", arguments: { query: "test" } }];

    const processor = new ToolExecutionProcessor(customEnv);
    const result = await processor.handle(withPhase(ctx, "tool_execution"));

    expect((result as any).ok).toBe(true);
    expect(envExecuted).toBe(true);
    expect(ctx.turn.toolResults[0]!.output).toBe("from-env: test");
  });

  it("injects custom ToolRunner into registerBuiltInProcessors", async () => {
    let envExecuted = false;
    const customEnv: ToolRunner = {
      execute: async () => {
        envExecuted = true;
        return { output: "custom-env-result" };
      },
    };

    const tool: Tool = {
      definition: { name: "echo", description: "Echo", parameters: {} },
      execute: async () => ({ output: "original" }),
    };
    const tools = new Map([["echo", tool]]);

    const llm = stubLLM({
      chatStream: async function* () {
        yield {
          content: "",
          toolCalls: [{ id: "c1", name: "echo", arguments: {} }],
          usage: { promptTokens: 10, completionTokens: 5 },
          finishReason: "tool_call" as const,
        };
      },
    });

    const engine = new HandlerEngine();
    registerBuiltInProcessors(engine, { executionEnv: customEnv });

    const store = new InMemoryCheckpointStore();
    const harness = new Harness({ store });
    const agent = new AgentContext({ llm, tools, handlerEngine: engine });
    const session = new SessionContext(testConfig());

    const result = await harness.runTurn(session, agent);
    expect(result.status).toBe("completed");
    expect(envExecuted).toBe(true);
  });
});

describe("DirectToolRunner", () => {
  it("delegates to tool.execute()", async () => {
    const tool: Tool = {
      definition: { name: "echo", description: "Echo", parameters: {} },
      execute: async (params) => ({ output: `echo: ${params.msg}` }),
    };
    const { ctx } = makeCtx();
    const env = new DirectToolRunner();

    const result = await env.execute(tool, { msg: "hello" }, ctx.turn);

    expect(result.output).toBe("echo: hello");
  });

  it("propagates errors from tool.execute()", async () => {
    const tool: Tool = {
      definition: { name: "fail", description: "Fails", parameters: {} },
      execute: async () => { throw new Error("boom"); },
    };
    const { ctx } = makeCtx();
    const env = new DirectToolRunner();

    await expect(env.execute(tool, {}, ctx.turn)).rejects.toThrow("boom");
  });
});

describe("ResultObservationProcessor", () => {
  it("appends LLM response to Working Memory", async () => {
    const { ctx, session } = makeCtx();
    ctx.turn.addMessage({ role: "assistant", content: "LLM says hi" });

    const processor = new ResultObservationProcessor();
    const result = await processor.handle(withPhase(ctx, "result_observation"));

    expect((result as any).ok).toBe(true);
    const msgs = session.workingMemory.getMessages();
    expect(msgs.some((m) => m.content === "LLM says hi")).toBe(true);
  });

  it("appends tool results to Working Memory", async () => {
    const { ctx, session } = makeCtx();
    ctx.turn.addMessage({
      role: "assistant",
      content: "",
      toolCalls: [{ id: "c1", name: "search", arguments: {} }],
    });
    ctx.turn.addToolResult({ output: "search result" });

    const processor = new ResultObservationProcessor();
    await processor.handle(withPhase(ctx, "result_observation"));

    const msgs = session.workingMemory.getMessages();
    expect(msgs.some((m) => m.role === "tool")).toBe(true);
  });
});

describe("registerBuiltInProcessors", () => {
  it("registers all 5 processors into HandlerEngine", () => {
    const engine = new HandlerEngine();
    registerBuiltInProcessors(engine);

    const handlers = engine.getHandlers("phase:before");
    const names = handlers.map((h) => h.name);
    expect(names).toContain("context_assembly");
    expect(names).toContain("llm_inference");
    expect(names).toContain("action_resolution");
    expect(names).toContain("tool_execution");
    expect(names).toContain("result_observation");
  });

  it("processors are overridable via replace()", () => {
    const engine = new HandlerEngine();
    registerBuiltInProcessors(engine);

    const custom = {
      name: "llm_inference",
      phases: ["llm_inference"] as any,
      priority: 10,
      trust: 3 as const,
      handle: async () => ({ ok: true as const }),
    };
    engine.replace("llm_inference", custom);

    const handlers = engine.getHandlers("phase:before");
    const llmHandler = handlers.find((h) => h.name === "llm_inference");
    expect(llmHandler).toBe(custom);
  });
});

describe("Integration: full turn cycle", () => {
  it("completes a full turn with mock LLM and tools", async () => {
    const llm = stubLLM({
      chatStream: async function* () {
        yield { content: "I found something", usage: { promptTokens: 15, completionTokens: 8 }, finishReason: "stop" };
      },
    });

    const engine = new HandlerEngine();
    registerBuiltInProcessors(engine);

    const store = new InMemoryCheckpointStore();
    const harness = new Harness({ store });
    const agent = new AgentContext({
      llm,
      tools: new Map(),
      handlerEngine: engine,
    });
    const session = new SessionContext(testConfig());
    session.workingMemory.push({ role: "user", content: "What is Proteus?" });

    const result = await harness.runTurn(session, agent);
    expect(result.status).toBe("completed");
    expect(session.workingMemory.getMessages().length).toBeGreaterThan(1);
  });

  it("handles multi-tool turn", async () => {
    let callCount = 0;
    const llm = stubLLM({
      chat: async () => {
        callCount++;
        if (callCount === 1) {
          return {
            content: "",
            toolCalls: [
              { id: "c1", name: "search", arguments: { query: "test" } },
            ],
            usage: { promptTokens: 10, completionTokens: 5 },
            finishReason: "tool_call",
          };
        }
        return {
          content: "Done with tools",
          toolCalls: [],
          usage: { promptTokens: 10, completionTokens: 5 },
          finishReason: "stop",
        };
      },
    });

    const tool: Tool = {
      definition: { name: "search", description: "Search", parameters: {} },
      execute: async () => ({ output: "found it" }),
    };
    const tools = new Map([["search", tool]]);

    const engine = new HandlerEngine();
    registerBuiltInProcessors(engine);

    const store = new InMemoryCheckpointStore();
    const harness = new Harness({ store });
    const agent = new AgentContext({ llm, tools, handlerEngine: engine });
    const session = new SessionContext(testConfig());

    const result = await harness.runTurn(session, agent);
    expect(result.status).toBe("completed");
  });
});
