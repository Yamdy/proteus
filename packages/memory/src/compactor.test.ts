import { describe, it, expect } from "vitest";
import { ContextCompactor } from "./compactor.js";
import type { LLMMessage } from "@proteus/core";

function msg(role: LLMMessage["role"], content: string): LLMMessage {
  return { role, content };
}

describe("ContextCompactor", () => {
  it("preserves system prompt messages", () => {
    const compactor = new ContextCompactor({ recentCount: 2 });
    const messages: LLMMessage[] = [
      msg("system", "You are a helpful assistant."),
      msg("user", "hello"),
      msg("assistant", "hi"),
    ];
    const result = compactor.compact(messages);
    expect(result.messages[0]).toEqual(msg("system", "You are a helpful assistant."));
  });

  it("discards tool role messages", () => {
    const compactor = new ContextCompactor({ recentCount: 2 });
    const messages: LLMMessage[] = [
      msg("system", "sys"),
      msg("user", "run the tool"),
      msg("assistant", "calling tool"),
      msg("tool", '{"result":"data"}'),
      msg("assistant", "done"),
    ];
    const result = compactor.compact(messages);
    expect(result.messages.some((m) => m.role === "tool")).toBe(false);
  });

  it("keeps recent N messages and summarizes middle", () => {
    const compactor = new ContextCompactor({ recentCount: 2 });
    const messages: LLMMessage[] = [
      msg("system", "sys"),
      msg("user", "a"),
      msg("assistant", "b"),
      msg("user", "c"),
      msg("assistant", "d"),
      msg("user", "e"),
      msg("assistant", "f"),
    ];
    const result = compactor.compact(messages);
    // system + compacted summary + last 2 recent
    expect(result.messages[0].role).toBe("system");
    expect(result.messages[1].content).toContain("compacted");
    expect(result.messages[1].content).toContain("4 messages summarized");
    expect(result.messages.slice(2)).toEqual([
      msg("user", "e"),
      msg("assistant", "f"),
    ]);
    expect(result.strategy).toBe("compacted");
    expect(result.originalCount).toBe(7);
  });

  it("empty input returns empty result", () => {
    const compactor = new ContextCompactor();
    const result = compactor.compact([]);
    expect(result.messages).toEqual([]);
    expect(result.originalCount).toBe(0);
    expect(result.strategy).toBe("full");
  });

  it("returns full strategy when messages <= recentCount", () => {
    const compactor = new ContextCompactor({ recentCount: 5 });
    const messages: LLMMessage[] = [
      msg("system", "sys"),
      msg("user", "a"),
      msg("assistant", "b"),
    ];
    const result = compactor.compact(messages);
    expect(result.strategy).toBe("full");
    expect(result.messages).toHaveLength(3);
  });

  it("recentCount is configurable", () => {
    const compactor = new ContextCompactor({ recentCount: 1 });
    const messages: LLMMessage[] = [
      msg("user", "a"),
      msg("assistant", "b"),
      msg("user", "c"),
    ];
    const result = compactor.compact(messages);
    // middle: [user:a, assistant:b] summarized, recent: [user:c]
    expect(result.messages[0].content).toContain("compacted");
    expect(result.messages[1]).toEqual(msg("user", "c"));
    expect(result.strategy).toBe("compacted");
  });
});
