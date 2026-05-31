import { describe, it, expect } from "vitest";
import {
  AllowAllPolicy,
  DenyListPolicy,
} from "./governance.js";
import { AgentContext, SessionContext, TurnContext, HandlerContext } from "./context.js";
import type { LLMProvider, ToolCall, ToolResult } from "./types.js";

// --- Helpers ---

function stubLLM(): LLMProvider {
  return {
    chat: async () => ({ content: "", usage: { promptTokens: 0, completionTokens: 0 }, finishReason: "stop" as const }),
    chatStream: async function* () {},
    countTokens: () => 0,
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
