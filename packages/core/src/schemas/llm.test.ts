import { describe, it, expect } from "vitest";
import { ToolCallSchema, LLMResponseSchema } from "./llm.js";

describe("ToolCallSchema", () => {
  it("accepts valid tool call", () => {
    const result = ToolCallSchema.safeParse({
      id: "call_1",
      name: "search",
      arguments: { query: "hello" },
    });
    expect(result.success).toBe(true);
  });

  it("accepts tool call with empty arguments", () => {
    const result = ToolCallSchema.safeParse({
      id: "call_2",
      name: "noop",
      arguments: {},
    });
    expect(result.success).toBe(true);
  });

  it("accepts arguments with unknown value types", () => {
    const result = ToolCallSchema.safeParse({
      id: "call_3",
      name: "complex",
      arguments: { num: 42, nested: { a: true }, arr: [1, 2] },
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing id", () => {
    const result = ToolCallSchema.safeParse({
      name: "search",
      arguments: {},
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing name", () => {
    const result = ToolCallSchema.safeParse({
      id: "call_1",
      arguments: {},
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing arguments", () => {
    const result = ToolCallSchema.safeParse({
      id: "call_1",
      name: "search",
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-string id", () => {
    const result = ToolCallSchema.safeParse({
      id: 123,
      name: "search",
      arguments: {},
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-object arguments", () => {
    const result = ToolCallSchema.safeParse({
      id: "call_1",
      name: "search",
      arguments: "bad",
    });
    expect(result.success).toBe(false);
  });
});

describe("LLMResponseSchema", () => {
  it("accepts minimal valid response", () => {
    const result = LLMResponseSchema.safeParse({
      content: "Hello!",
      usage: { promptTokens: 10, completionTokens: 5 },
      finishReason: "stop",
    });
    expect(result.success).toBe(true);
  });

  it("accepts response with thinking", () => {
    const result = LLMResponseSchema.safeParse({
      content: "Answer",
      thinking: "Let me think...",
      usage: { promptTokens: 10, completionTokens: 20 },
      finishReason: "stop",
    });
    expect(result.success).toBe(true);
  });

  it("accepts response with tool calls", () => {
    const result = LLMResponseSchema.safeParse({
      content: "",
      toolCalls: [
        { id: "call_1", name: "search", arguments: { query: "test" } },
      ],
      usage: { promptTokens: 10, completionTokens: 15 },
      finishReason: "tool_call",
    });
    expect(result.success).toBe(true);
  });

  it("accepts response with all optional fields", () => {
    const result = LLMResponseSchema.safeParse({
      content: "done",
      thinking: "reasoning",
      toolCalls: [
        { id: "c1", name: "a", arguments: {} },
        { id: "c2", name: "b", arguments: { x: 1 } },
      ],
      usage: { promptTokens: 100, completionTokens: 50 },
      finishReason: "stop",
    });
    expect(result.success).toBe(true);
  });

  it("accepts all valid finishReason values", () => {
    for (const reason of ["stop", "tool_call", "length", "error"]) {
      const result = LLMResponseSchema.safeParse({
        content: "x",
        usage: { promptTokens: 1, completionTokens: 1 },
        finishReason: reason,
      });
      expect(result.success).toBe(true);
    }
  });

  it("rejects missing content", () => {
    const result = LLMResponseSchema.safeParse({
      usage: { promptTokens: 1, completionTokens: 1 },
      finishReason: "stop",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing usage", () => {
    const result = LLMResponseSchema.safeParse({
      content: "hello",
      finishReason: "stop",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing finishReason", () => {
    const result = LLMResponseSchema.safeParse({
      content: "hello",
      usage: { promptTokens: 1, completionTokens: 1 },
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid finishReason", () => {
    const result = LLMResponseSchema.safeParse({
      content: "hello",
      usage: { promptTokens: 1, completionTokens: 1 },
      finishReason: "unknown",
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-integer token counts", () => {
    const result = LLMResponseSchema.safeParse({
      content: "hello",
      usage: { promptTokens: 1.5, completionTokens: 2.3 },
      finishReason: "stop",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing promptTokens in usage", () => {
    const result = LLMResponseSchema.safeParse({
      content: "hello",
      usage: { completionTokens: 5 },
      finishReason: "stop",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing completionTokens in usage", () => {
    const result = LLMResponseSchema.safeParse({
      content: "hello",
      usage: { promptTokens: 5 },
      finishReason: "stop",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid tool call in toolCalls array", () => {
    const result = LLMResponseSchema.safeParse({
      content: "",
      toolCalls: [{ id: "c1", name: "x" /* missing arguments */ }],
      usage: { promptTokens: 1, completionTokens: 1 },
      finishReason: "tool_call",
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-string content", () => {
    const result = LLMResponseSchema.safeParse({
      content: 123,
      usage: { promptTokens: 1, completionTokens: 1 },
      finishReason: "stop",
    });
    expect(result.success).toBe(false);
  });
});
