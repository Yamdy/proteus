import { describe, it, expect, vi } from "vitest";
import { ContextCompactor } from "./compactor.js";
import type { LLMMessage, LLMProvider, LLMResponse } from "@proteus/core";

function msg(role: LLMMessage["role"], content: string): LLMMessage {
  return { role, content };
}

function mockLLMProvider(responseContent: string): LLMProvider {
  const response: LLMResponse = {
    content: responseContent,
    usage: { promptTokens: 10, completionTokens: 5 },
    finishReason: "stop",
  };
  return {
    chat: vi.fn().mockResolvedValue(response),
    chatStream: vi.fn(),
    countTokens: vi.fn().mockReturnValue(10),
  };
}

describe("ContextCompactor", () => {
  it("preserves system prompt messages", async () => {
    const compactor = new ContextCompactor({ recentCount: 2 });
    const messages: LLMMessage[] = [
      msg("system", "You are a helpful assistant."),
      msg("user", "hello"),
      msg("assistant", "hi"),
    ];
    const result = await compactor.compact(messages);
    expect(result.messages[0]).toEqual(msg("system", "You are a helpful assistant."));
  });

  it("discards tool role messages", async () => {
    const compactor = new ContextCompactor({ recentCount: 2 });
    const messages: LLMMessage[] = [
      msg("system", "sys"),
      msg("user", "run the tool"),
      msg("assistant", "calling tool"),
      msg("tool", '{"result":"data"}'),
      msg("assistant", "done"),
    ];
    const result = await compactor.compact(messages);
    expect(result.messages.some((m) => m.role === "tool")).toBe(false);
  });

  it("keeps recent N messages and summarizes middle", async () => {
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
    const result = await compactor.compact(messages);
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

  it("empty input returns empty result", async () => {
    const compactor = new ContextCompactor();
    const result = await compactor.compact([]);
    expect(result.messages).toEqual([]);
    expect(result.originalCount).toBe(0);
    expect(result.strategy).toBe("full");
  });

  it("returns full strategy when messages <= recentCount", async () => {
    const compactor = new ContextCompactor({ recentCount: 5 });
    const messages: LLMMessage[] = [
      msg("system", "sys"),
      msg("user", "a"),
      msg("assistant", "b"),
    ];
    const result = await compactor.compact(messages);
    expect(result.strategy).toBe("full");
    expect(result.messages).toHaveLength(3);
  });

  it("recentCount is configurable", async () => {
    const compactor = new ContextCompactor({ recentCount: 1 });
    const messages: LLMMessage[] = [
      msg("user", "a"),
      msg("assistant", "b"),
      msg("user", "c"),
    ];
    const result = await compactor.compact(messages);
    // middle: [user:a, assistant:b] summarized, recent: [user:c]
    expect(result.messages[0].content).toContain("compacted");
    expect(result.messages[1]).toEqual(msg("user", "c"));
    expect(result.strategy).toBe("compacted");
  });

  // --- LLM summary strategy ---

  it("defaults summaryStrategy to truncation (backward compat)", async () => {
    const compactor = new ContextCompactor({ recentCount: 1 });
    const messages: LLMMessage[] = [
      msg("user", "a"),
      msg("assistant", "b"),
      msg("user", "c"),
    ];
    const result = await compactor.compact(messages);
    expect(result.messages[0].content).toContain("compacted");
    expect(result.messages[0].content).toContain("2 messages summarized");
  });

  it("uses llmProvider when summaryStrategy is llm", async () => {
    const provider = mockLLMProvider("Summary of the conversation so far.");
    const compactor = new ContextCompactor({
      recentCount: 1,
      llmProvider: provider,
      summaryStrategy: "llm",
    });
    const messages: LLMMessage[] = [
      msg("user", "a"),
      msg("assistant", "b"),
      msg("user", "c"),
    ];
    const result = await compactor.compact(messages);
    expect(result.messages[0].content).toBe("Summary of the conversation so far.");
    expect(result.messages[1]).toEqual(msg("user", "c"));
    expect(result.strategy).toBe("llm");
    expect(provider.chat).toHaveBeenCalledOnce();
  });

  it("passes summaryPrompt to llmProvider.chat", async () => {
    const provider = mockLLMProvider("ok");
    const customPrompt = "Summarize briefly.";
    const compactor = new ContextCompactor({
      recentCount: 1,
      llmProvider: provider,
      summaryStrategy: "llm",
      summaryPrompt: customPrompt,
    });
    const messages: LLMMessage[] = [
      msg("user", "a"),
      msg("assistant", "b"),
      msg("user", "c"),
    ];
    await compactor.compact(messages);
    const callArgs = (provider.chat as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(callArgs[0][0].content).toBe(customPrompt);
  });

  it("falls back to truncation when llmProvider.chat throws", async () => {
    const provider: LLMProvider = {
      chat: vi.fn().mockRejectedValue(new Error("LLM unavailable")),
      chatStream: vi.fn(),
      countTokens: vi.fn().mockReturnValue(10),
    };
    const compactor = new ContextCompactor({
      recentCount: 1,
      llmProvider: provider,
      summaryStrategy: "llm",
    });
    const messages: LLMMessage[] = [
      msg("user", "a"),
      msg("assistant", "b"),
      msg("user", "c"),
    ];
    const result = await compactor.compact(messages);
    expect(result.messages[0].content).toContain("compacted");
    expect(result.messages[0].content).toContain("2 messages summarized");
  });

  it("falls back to truncation when summaryStrategy is llm but no provider", async () => {
    const compactor = new ContextCompactor({
      recentCount: 1,
      summaryStrategy: "llm",
    });
    const messages: LLMMessage[] = [
      msg("user", "a"),
      msg("assistant", "b"),
      msg("user", "c"),
    ];
    const result = await compactor.compact(messages);
    expect(result.messages[0].content).toContain("compacted");
    expect(result.messages[0].content).toContain("2 messages summarized");
  });

  it("llmProvider is unused when summaryStrategy is truncation", async () => {
    const provider = mockLLMProvider("should not be used");
    const compactor = new ContextCompactor({
      recentCount: 1,
      llmProvider: provider,
      summaryStrategy: "truncation",
    });
    const messages: LLMMessage[] = [
      msg("user", "a"),
      msg("assistant", "b"),
      msg("user", "c"),
    ];
    const result = await compactor.compact(messages);
    expect(result.messages[0].content).toContain("2 messages summarized");
    expect(provider.chat).not.toHaveBeenCalled();
  });

  // --- summary field ---

  it("includes summary field when strategy is compacted", async () => {
    const compactor = new ContextCompactor({ recentCount: 2 });
    const messages: LLMMessage[] = [
      msg("user", "a"),
      msg("assistant", "b"),
      msg("user", "c"),
      msg("assistant", "d"),
      msg("user", "e"),
      msg("assistant", "f"),
    ];
    const result = await compactor.compact(messages);
    expect(result.strategy).toBe("compacted");
    expect(result.summary).toBeDefined();
    expect(result.summary).toContain("4 messages summarized");
  });

  it("summary is undefined when strategy is full", async () => {
    const compactor = new ContextCompactor({ recentCount: 10 });
    const messages: LLMMessage[] = [
      msg("user", "a"),
      msg("assistant", "b"),
    ];
    const result = await compactor.compact(messages);
    expect(result.strategy).toBe("full");
    expect(result.summary).toBeUndefined();
  });

  // --- summarizedCount ---

  it("includes summarizedCount when strategy is compacted", async () => {
    const compactor = new ContextCompactor({ recentCount: 2 });
    const messages: LLMMessage[] = [
      msg("user", "a"),
      msg("assistant", "b"),
      msg("user", "c"),
      msg("assistant", "d"),
      msg("user", "e"),
      msg("assistant", "f"),
    ];
    const result = await compactor.compact(messages);
    expect(result.strategy).toBe("compacted");
    expect(result.summarizedCount).toBe(4);
  });

  it("summarizedCount is 0 when strategy is full", async () => {
    const compactor = new ContextCompactor({ recentCount: 10 });
    const messages: LLMMessage[] = [
      msg("user", "a"),
      msg("assistant", "b"),
    ];
    const result = await compactor.compact(messages);
    expect(result.strategy).toBe("full");
    expect(result.summarizedCount).toBeUndefined();
  });

  // --- incremental summarization (truncation strategy) ---

  it("incremental: merges previous summary with new middle (truncation)", async () => {
    const compactor = new ContextCompactor({ recentCount: 2 });

    // First compaction
    const messages1: LLMMessage[] = [
      msg("user", "a"),
      msg("assistant", "b"),
      msg("user", "c"),
      msg("assistant", "d"),
      msg("user", "e"),
      msg("assistant", "f"),
    ];
    const result1 = await compactor.compact(messages1);
    expect(result1.summary).toContain("4 messages summarized");
    expect(result1.summarizedCount).toBe(4);

    // Second compaction with more messages, passing previous result
    const messages2: LLMMessage[] = [
      msg("user", "a"),
      msg("assistant", "b"),
      msg("user", "c"),
      msg("assistant", "d"),
      msg("user", "e"),
      msg("assistant", "f"),
      msg("user", "g"),
      msg("assistant", "h"),
      msg("user", "i"),
      msg("assistant", "j"),
    ];
    const result2 = await compactor.compact(messages2, result1);
    expect(result2.strategy).toBe("compacted");
    expect(result2.summary).toBeDefined();
    // Incremental: only new messages (4 new beyond summarizedCount=4) are summarized, merged with old summary
    // Old: "[compacted: 4 messages summarized]", new delta: "[compacted: 4 messages summarized]"
    expect(result2.summary).toContain("[compacted: 4 messages summarized]");
    expect(result2.summary!.indexOf("\n")).toBeGreaterThan(0);
    expect(result2.summarizedCount).toBe(8);
  });

  it("incremental: without previousResult behaves same as non-incremental", async () => {
    const compactor = new ContextCompactor({ recentCount: 2 });
    const messages: LLMMessage[] = [
      msg("user", "a"),
      msg("assistant", "b"),
      msg("user", "c"),
      msg("assistant", "d"),
      msg("user", "e"),
      msg("assistant", "f"),
    ];
    const result = await compactor.compact(messages);
    expect(result.summary).toContain("4 messages summarized");
    expect(result.summary).not.toContain("\n");
    expect(result.summarizedCount).toBe(4);
  });

  it("incremental: reuses previous summary when no new messages", async () => {
    const compactor = new ContextCompactor({ recentCount: 2 });

    const messages: LLMMessage[] = [
      msg("user", "a"),
      msg("assistant", "b"),
      msg("user", "c"),
      msg("assistant", "d"),
      msg("user", "e"),
      msg("assistant", "f"),
    ];
    const result1 = await compactor.compact(messages);

    // Same messages again — no new messages beyond summarizedCount
    const result2 = await compactor.compact(messages, result1);
    expect(result2.summary).toBe(result1.summary);
    expect(result2.summarizedCount).toBe(4);
  });

  // --- incremental summarization (LLM strategy) ---

  it("incremental: LLM strategy reuses previous summary when no new messages", async () => {
    const provider = mockLLMProvider("Updated summary incorporating new messages.");
    const compactor = new ContextCompactor({
      recentCount: 2,
      llmProvider: provider,
      summaryStrategy: "llm",
    });

    const previousResult = {
      messages: [],
      originalCount: 6,
      compactedCount: 3,
      strategy: "compacted" as const,
      summary: "Previous summary of old messages.",
      summarizedCount: 4,
    };

    const messages: LLMMessage[] = [
      msg("user", "a"),
      msg("assistant", "b"),
      msg("user", "c"),
      msg("assistant", "d"),
      msg("user", "e"),
      msg("assistant", "f"),
    ];
    const result = await compactor.compact(messages, previousResult);

    // No new messages beyond summarizedCount, so LLM is not called; previous summary is reused
    expect(result.summary).toBe("Previous summary of old messages.");
    expect(result.summarizedCount).toBe(4);
    expect(provider.chat).not.toHaveBeenCalled();
  });

  it("incremental: LLM strategy includes previous summary in prompt for new messages", async () => {
    const provider = mockLLMProvider("Updated summary incorporating new messages.");
    const compactor = new ContextCompactor({
      recentCount: 2,
      llmProvider: provider,
      summaryStrategy: "llm",
    });

    const previousResult = {
      messages: [],
      originalCount: 6,
      compactedCount: 3,
      strategy: "compacted" as const,
      summary: "Previous summary of old messages.",
      summarizedCount: 2,
    };

    const messages: LLMMessage[] = [
      msg("user", "a"),
      msg("assistant", "b"),
      msg("user", "c"),
      msg("assistant", "d"),
      msg("user", "e"),
      msg("assistant", "f"),
    ];
    const result = await compactor.compact(messages, previousResult);

    expect(result.summary).toBe("Updated summary incorporating new messages.");
    expect(result.summarizedCount).toBe(4);
    // Verify the prompt included the previous summary
    const callArgs = (provider.chat as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(callArgs[0][0].content).toContain("Previous summary of old messages.");
    expect(callArgs[0][0].content).toContain("Incrementally update");
    // Verify only delta messages (c,d) were sent as user content
    const userContent = callArgs[0][1].content;
    expect(userContent).toContain("user: c");
    expect(userContent).toContain("assistant: d");
    expect(userContent).not.toContain("user: a");
  });

  it("incremental: LLM strategy summarizes only new messages", async () => {
    const provider = mockLLMProvider("Updated summary with new info.");
    const compactor = new ContextCompactor({
      recentCount: 2,
      llmProvider: provider,
      summaryStrategy: "llm",
    });

    const previousResult = {
      messages: [],
      originalCount: 6,
      compactedCount: 3,
      strategy: "compacted" as const,
      summary: "Previous summary.",
      summarizedCount: 4,
    };

    // 4 already summarized + 2 new + 2 recent
    const messages: LLMMessage[] = [
      msg("user", "a"),
      msg("assistant", "b"),
      msg("user", "c"),
      msg("assistant", "d"),
      msg("user", "e"),
      msg("assistant", "f"),
      msg("user", "g"),
      msg("assistant", "h"),
    ];
    const result = await compactor.compact(messages, previousResult);

    expect(result.summary).toBe("Updated summary with new info.");
    expect(result.summarizedCount).toBe(6);
    // Verify only new (delta) messages were passed to LLM, not already-summarized ones
    const callArgs = (provider.chat as ReturnType<typeof vi.fn>).mock.calls[0];
    const userContent = callArgs[0][1].content;
    // middle=[a,b,c,d,e,f], summarizedCount=4, new=[e,f]
    expect(userContent).toContain("user: e");
    expect(userContent).toContain("assistant: f");
    expect(userContent).not.toContain("user: a");
    expect(userContent).not.toContain("user: c");
  });

  it("incremental: LLM fallback merges previous summary on error", async () => {
    const provider: LLMProvider = {
      chat: vi.fn().mockRejectedValue(new Error("LLM unavailable")),
      chatStream: vi.fn(),
      countTokens: vi.fn().mockReturnValue(10),
    };
    const compactor = new ContextCompactor({
      recentCount: 2,
      llmProvider: provider,
      summaryStrategy: "llm",
    });

    const previousResult = {
      messages: [],
      originalCount: 6,
      compactedCount: 3,
      strategy: "compacted" as const,
      summary: "Old summary.",
      summarizedCount: 4,
    };

    const messages: LLMMessage[] = [
      msg("user", "a"),
      msg("assistant", "b"),
      msg("user", "c"),
      msg("assistant", "d"),
      msg("user", "e"),
      msg("assistant", "f"),
      msg("user", "g"),
      msg("assistant", "h"),
    ];
    const result = await compactor.compact(messages, previousResult);

    // Fallback should include old summary + new truncation (only new messages)
    expect(result.summary).toContain("Old summary.");
    expect(result.summary).toContain("2 messages summarized");
    expect(result.summarizedCount).toBe(6);
  });
});
