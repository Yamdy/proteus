import { describe, it, expect, vi, beforeEach } from "vitest";
import type { LLMMessage, ToolDefinition } from "./index.js";

// Mock the 'ai' module
vi.mock("ai", () => ({
  generateText: vi.fn(),
  streamText: vi.fn(),
}));

import { generateText, streamText } from "ai";
import { VercelLLMProvider } from "./vercel-llm-provider.js";

const mockGenerateText = vi.mocked(generateText);
const mockStreamText = vi.mocked(streamText);

function makeProvider(opts?: { provider?: string; model?: string; temperature?: number; apiKey?: string }) {
  return new VercelLLMProvider({
    provider: opts?.provider ?? "openai",
    model: opts?.model ?? "gpt-4o",
    temperature: opts?.temperature ?? 0,
    apiKey: opts?.apiKey ?? "test-key",
  });
}

describe("VercelLLMProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("chat()", () => {
    it("calls generateText with mapped messages and returns LLMResponse", async () => {
      const provider = makeProvider();
      const messages: LLMMessage[] = [
        { role: "system", content: "You are helpful." },
        { role: "user", content: "Hello" },
      ];
      const tools: ToolDefinition[] = [];

      mockGenerateText.mockResolvedValue({
        text: "Hi there!",
        toolCalls: [],
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        finishReason: "stop",
      } as any);

      const result = await provider.chat(messages, tools);

      expect(result.content).toBe("Hi there!");
      expect(result.toolCalls).toEqual([]);
      expect(result.usage).toEqual({ promptTokens: 10, completionTokens: 5 });
      expect(result.finishReason).toBe("stop");
      expect(mockGenerateText).toHaveBeenCalledOnce();
    });

    it("maps Proteus messages to AI SDK format correctly", async () => {
      const provider = makeProvider();
      const messages: LLMMessage[] = [
        { role: "system", content: "System prompt" },
        { role: "user", content: "User message" },
        { role: "assistant", content: "Assistant reply" },
      ];

      mockGenerateText.mockResolvedValue({
        text: "ok",
        toolCalls: [],
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
        finishReason: "stop",
      } as any);

      await provider.chat(messages, []);

      const callArgs = mockGenerateText.mock.calls[0]![0] as any;
      expect(callArgs.messages).toEqual([
        { role: "system", content: "System prompt" },
        { role: "user", content: [{ type: "text", text: "User message" }] },
        { role: "assistant", content: [{ type: "text", text: "Assistant reply" }] },
      ]);
    });

    it("maps tool calls from LLM response", async () => {
      const provider = makeProvider();
      mockGenerateText.mockResolvedValue({
        text: "",
        toolCalls: [
          { toolCallId: "call_1", toolName: "search", input: { query: "test" } },
        ],
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        finishReason: "tool-calls",
      } as any);

      const result = await provider.chat([], []);

      expect(result.toolCalls).toEqual([
        { id: "call_1", name: "search", arguments: { query: "test" } },
      ]);
      expect(result.finishReason).toBe("tool_call");
    });

    it("converts ToolDefinition to AI SDK tool format", async () => {
      const provider = makeProvider();
      const tools: ToolDefinition[] = [
        {
          name: "search",
          description: "Search the web",
          parameters: { type: "object", properties: { query: { type: "string" } } },
        },
      ];

      mockGenerateText.mockResolvedValue({
        text: "done",
        toolCalls: [],
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
        finishReason: "stop",
      } as any);

      await provider.chat([], tools);

      const callArgs = mockGenerateText.mock.calls[0]![0] as any;
      expect(callArgs.tools).toBeDefined();
      expect(callArgs.tools.search).toBeDefined();
      expect(callArgs.tools.search.description).toBe("Search the web");
    });

    it("throws on generateText error", async () => {
      const provider = makeProvider();
      mockGenerateText.mockRejectedValue(new Error("API key invalid"));

      await expect(provider.chat([], [])).rejects.toThrow("API key invalid");
    });
  });

  describe("chatStream()", () => {
    it("yields LLMResponse chunks from streamText", async () => {
      const provider = makeProvider();

      mockStreamText.mockResolvedValue({
        fullStream: (async function* () {
          yield { type: "text", text: "Hello " };
          yield { type: "text", text: "world" };
          yield { type: "finish", finishReason: "stop", usage: { promptTokens: 5, completionTokens: 3, totalTokens: 8 } };
        })(),
      } as any);

      const chunks: string[] = [];
      for await (const chunk of provider.chatStream([], [])) {
        if (chunk.content) chunks.push(chunk.content);
      }

      expect(chunks).toEqual(["Hello ", "world"]);
    });

    it("handles tool call chunks in stream", async () => {
      const provider = makeProvider();

      mockStreamText.mockResolvedValue({
        fullStream: (async function* () {
          yield { type: "tool-call", toolCallId: "c1", toolName: "fn", input: { a: 1 } };
          yield { type: "finish", finishReason: "tool-calls", usage: { promptTokens: 5, completionTokens: 3, totalTokens: 8 } };
        })(),
      } as any);

      const chunks: any[] = [];
      for await (const chunk of provider.chatStream([], [])) {
        chunks.push(chunk);
      }

      expect(chunks[0]!.toolCalls).toEqual([
        { id: "c1", name: "fn", arguments: { a: 1 } },
      ]);
    });
  });

  describe("countTokens()", () => {
    it("returns approximate token count", () => {
      const provider = makeProvider();
      const count = provider.countTokens("Hello world, this is a test.");
      expect(count).toBeGreaterThan(0);
      expect(typeof count).toBe("number");
    });
  });
});
