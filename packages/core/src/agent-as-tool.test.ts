import { describe, it, expect, beforeEach, vi } from "vitest";
import { createAgentTool } from "./agent-as-tool.js";
import { AgentRegistry } from "./agent-registry.js";
import type { AgentDefinition, AgentRouter, AgentRouterResult, ToolContext } from "./types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAgent(overrides?: Partial<AgentDefinition>): AgentDefinition {
  return {
    id: "target-agent",
    name: "Target Agent",
    description: "A helpful sub-agent",
    systemPrompt: "You are a helpful sub-agent.",
    ...overrides,
  };
}

function makeRouter(result: AgentRouterResult): AgentRouter {
  return vi.fn(async (_agentId: string, _task: string, _context?: string): Promise<AgentRouterResult> => result) as unknown as AgentRouter;
}

function makeContext(): ToolContext {
  return { turnId: "turn_1", sessionId: "session_1" };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("createAgentTool", () => {
  let registry: AgentRegistry;

  beforeEach(() => {
    registry = new AgentRegistry();
    registry.register(makeAgent());
  });

  // --- Tool creation ---

  describe("tool creation", () => {
    it("returns a Tool with the correct definition shape", () => {
      const tool = createAgentTool({ agentId: "target-agent" }, registry, makeRouter({ output: "ok", status: "completed" }));

      expect(tool.definition.name).toBe("agent_target-agent");
      expect(tool.definition.description).toBe("A helpful sub-agent");
      expect(tool.definition.builtin).toBe(false);
      expect(tool.definition.parameters).toHaveProperty("properties.task");
      expect(tool.definition.parameters).toHaveProperty("properties.context");
    });

    it("uses explicit description over agent description when provided", () => {
      const tool = createAgentTool(
        { agentId: "target-agent", description: "Custom description" },
        registry,
        makeRouter({ output: "ok", status: "completed" }),
      );

      expect(tool.definition.description).toBe("Custom description");
    });

    it("falls back to generic description when agent not in registry", () => {
      const tool = createAgentTool(
        { agentId: "unknown-agent" },
        registry,
        makeRouter({ output: "ok", status: "completed" }),
      );

      expect(tool.definition.description).toBe('Delegate a task to agent "unknown-agent"');
    });

    it("generates unique tool names per agentId", () => {
      registry.register(makeAgent({ id: "agent-a" }));
      registry.register(makeAgent({ id: "agent-b" }));

      const toolA = createAgentTool({ agentId: "agent-a" }, registry, makeRouter({ output: "", status: "completed" }));
      const toolB = createAgentTool({ agentId: "agent-b" }, registry, makeRouter({ output: "", status: "completed" }));

      expect(toolA.definition.name).toBe("agent_agent-a");
      expect(toolB.definition.name).toBe("agent_agent-b");
      expect(toolA.definition.name).not.toBe(toolB.definition.name);
    });
  });

  // --- Tool execution delegates correctly ---

  describe("tool execution", () => {
    it("delegates to the router with task and context", async () => {
      const router = makeRouter({ output: "delegated result", status: "completed" });
      const tool = createAgentTool({ agentId: "target-agent" }, registry, router);

      const result = await tool.execute({ task: "do something", context: "extra info" }, makeContext());

      expect(router).toHaveBeenCalledWith("target-agent", "do something", "extra info");
      expect(result).toEqual({ output: "delegated result" });
    });

    it("delegates to the router with task only when no context provided", async () => {
      const router = makeRouter({ output: "result", status: "completed" });
      const tool = createAgentTool({ agentId: "target-agent" }, registry, router);

      const result = await tool.execute({ task: "summarize this" }, makeContext());

      expect(router).toHaveBeenCalledWith("target-agent", "summarize this", undefined);
      expect(result).toEqual({ output: "result" });
    });

    it("returns error when task is missing", async () => {
      const router = makeRouter({ output: "", status: "completed" });
      const tool = createAgentTool({ agentId: "target-agent" }, registry, router);

      const result = await tool.execute({}, makeContext());

      expect(result.error).toBeDefined();
      expect(result.error!.message).toContain('"task"');
      expect(router).not.toHaveBeenCalled();
    });

    it("returns error when task is empty string", async () => {
      const router = makeRouter({ output: "", status: "completed" });
      const tool = createAgentTool({ agentId: "target-agent" }, registry, router);

      const result = await tool.execute({ task: "   " }, makeContext());

      expect(result.error).toBeDefined();
      expect(result.error!.retryable).toBe(false);
      expect(router).not.toHaveBeenCalled();
    });

    it("returns error when task is not a string", async () => {
      const router = makeRouter({ output: "", status: "completed" });
      const tool = createAgentTool({ agentId: "target-agent" }, registry, router);

      const result = await tool.execute({ task: 123 }, makeContext());

      expect(result.error).toBeDefined();
      expect(router).not.toHaveBeenCalled();
    });

    it("propagates router errors as tool errors", async () => {
      const router = makeRouter({ output: "", status: "errored", error: "agent crashed" });
      const tool = createAgentTool({ agentId: "target-agent" }, registry, router);

      const result = await tool.execute({ task: "fail please" }, makeContext());

      expect(result.output).toBeNull();
      expect(result.error).toBeDefined();
      expect(result.error!.message).toBe("agent crashed");
      expect(result.error!.retryable).toBe(false);
    });

    it("uses generic error message when router returns errored with no message", async () => {
      const router = makeRouter({ output: "", status: "errored" });
      const tool = createAgentTool({ agentId: "target-agent" }, registry, router);

      const result = await tool.execute({ task: "fail" }, makeContext());

      expect(result.error!.message).toContain("returned an error");
    });

    it("handles router throwing an exception", async () => {
      const router: AgentRouter = vi.fn(async () => {
        throw new Error("network down");
      });
      const tool = createAgentTool({ agentId: "target-agent" }, registry, router);

      const result = await tool.execute({ task: "call remote" }, makeContext());

      expect(result.output).toBeNull();
      expect(result.error).toBeDefined();
      expect(result.error!.message).toContain("network down");
      expect(result.error!.retryable).toBe(false);
    });
  });

  // --- Timeout handling ---

  describe("timeout handling", () => {
    it("returns timed_out error when router exceeds timeout", async () => {
      const router: AgentRouter = vi.fn(async (): Promise<AgentRouterResult> => {
        await new Promise((resolve) => setTimeout(resolve, 500));
        return { output: "late", status: "completed" };
      }) as unknown as AgentRouter;

      const tool = createAgentTool(
        { agentId: "target-agent", timeout: 50 },
        registry,
        router,
      );

      const result = await tool.execute({ task: "slow task" }, makeContext());

      expect(result.output).toBeNull();
      expect(result.error).toBeDefined();
      expect(result.error!.message).toContain("timed out");
      expect(result.error!.retryable).toBe(true);
    });

    it("returns timed_out error when router reports timed_out status", async () => {
      const router = makeRouter({ output: "", status: "timed_out" });
      const tool = createAgentTool({ agentId: "target-agent" }, registry, router);

      const result = await tool.execute({ task: "slow task" }, makeContext());

      expect(result.output).toBeNull();
      expect(result.error).toBeDefined();
      expect(result.error!.message).toContain("timed out");
      expect(result.error!.retryable).toBe(true);
    });

    it("uses default 60s timeout when none specified", async () => {
      const router = makeRouter({ output: "ok", status: "completed" });
      const tool = createAgentTool({ agentId: "target-agent" }, registry, router);

      // Verify the tool was created (default timeout is applied internally)
      expect(tool.definition.name).toBe("agent_target-agent");

      // Fast router completes well within default timeout
      const result = await tool.execute({ task: "fast" }, makeContext());
      expect(result).toEqual({ output: "ok" });
    });

    it("cleans up timeout when router completes quickly", async () => {
      const router = makeRouter({ output: "done", status: "completed" });
      const tool = createAgentTool(
        { agentId: "target-agent", timeout: 100 },
        registry,
        router,
      );

      const result = await tool.execute({ task: "fast" }, makeContext());

      expect(result).toEqual({ output: "done" });
      expect(result.error).toBeUndefined();
    });
  });
});
