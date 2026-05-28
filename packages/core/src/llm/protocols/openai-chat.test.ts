import { describe, it, expect, vi, beforeEach } from "vitest";
import { createProtocol } from "./openai-chat.js";
import type { LLMMessage, ToolDefinition } from "../../index.js";

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function makeProtocol(opts?: { baseUrl?: string; model?: string; temperature?: number; apiKey?: string }) {
  return createProtocol({
    baseUrl: opts?.baseUrl ?? "https://api.openai.com/v1",
    apiKey: opts?.apiKey ?? "test-key",
    model: opts?.model ?? "gpt-4o",
    temperature: opts?.temperature ?? 0,
  });
}

function mockJsonResponse(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  } as any;
}

function mockSSEStream(chunks: string[]) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    pull(controller) {
      const chunk = chunks.shift();
      if (chunk) {
        controller.enqueue(encoder.encode(chunk));
      } else {
        controller.close();
      }
    },
  });
  return {
    ok: true,
    status: 200,
    body: stream,
    text: () => Promise.resolve(""),
  } as any;
}

describe("OpenAI Chat Protocol", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("chat()", () => {
    it("sends correct request format", async () => {
      const protocol = makeProtocol();
      mockFetch.mockResolvedValue(mockJsonResponse({
        choices: [{ message: { role: "assistant", content: "Hi!" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 10, completion_tokens: 3 },
      }));

      const messages: LLMMessage[] = [
        { role: "system", content: "You are helpful." },
        { role: "user", content: "Hello" },
      ];
      await protocol.chat(messages, []);

      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toBe("https://api.openai.com/v1/chat/completions");
      expect(opts.method).toBe("POST");
      expect(opts.headers.Authorization).toBe("Bearer test-key");

      const body = JSON.parse(opts.body);
      expect(body.model).toBe("gpt-4o");
      expect(body.messages).toEqual([
        { role: "system", content: "You are helpful." },
        { role: "user", content: "Hello" },
      ]);
    });

    it("maps response correctly", async () => {
      const protocol = makeProtocol();
      mockFetch.mockResolvedValue(mockJsonResponse({
        choices: [{ message: { role: "assistant", content: "Hi there!" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      }));

      const result = await protocol.chat([{ role: "user", content: "Hello" }], []);

      expect(result.content).toBe("Hi there!");
      expect(result.usage).toEqual({ promptTokens: 10, completionTokens: 5 });
      expect(result.finishReason).toBe("stop");
    });

    it("extracts reasoning_content as thinking", async () => {
      const protocol = makeProtocol();
      mockFetch.mockResolvedValue(mockJsonResponse({
        choices: [{ message: { role: "assistant", content: "Answer", reasoning_content: "Let me think..." }, finish_reason: "stop" }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      }));

      const result = await protocol.chat([{ role: "user", content: "Hello" }], []);

      expect(result.thinking).toBe("Let me think...");
      expect(result.content).toBe("Answer");
    });

    it("maps tool calls from response", async () => {
      const protocol = makeProtocol();
      mockFetch.mockResolvedValue(mockJsonResponse({
        choices: [{
          message: {
            role: "assistant",
            content: null,
            tool_calls: [{ id: "c1", type: "function", function: { name: "search", arguments: '{"query":"test"}' } }],
          },
          finish_reason: "tool_calls",
        }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      }));

      const result = await protocol.chat([], []);

      expect(result.toolCalls).toEqual([{ id: "c1", name: "search", arguments: { query: "test" } }]);
      expect(result.finishReason).toBe("tool_call");
    });

    it("includes tools in request", async () => {
      const protocol = makeProtocol();
      mockFetch.mockResolvedValue(mockJsonResponse({
        choices: [{ message: { role: "assistant", content: "ok" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 1, completion_tokens: 1 },
      }));

      const tools: ToolDefinition[] = [{ name: "search", description: "Search", parameters: { type: "object" } }];
      await protocol.chat([], tools);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.tools).toEqual([{ type: "function", function: { name: "search", description: "Search", parameters: { type: "object" } } }]);
    });

    it("includes thinking config when enabled", async () => {
      const protocol = createProtocol({ baseUrl: "https://api.deepseek.com/v1", apiKey: "k", model: "deepseek", thinking: true, reasoningEffort: "high" });
      mockFetch.mockResolvedValue(mockJsonResponse({
        choices: [{ message: { role: "assistant", content: "ok" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 1, completion_tokens: 1 },
      }));

      await protocol.chat([{ role: "user", content: "test" }], []);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.thinking).toEqual({ type: "enabled" });
      expect(body.reasoning_effort).toBe("high");
    });

    it("throws on API error", async () => {
      const protocol = makeProtocol();
      mockFetch.mockResolvedValue({ ok: false, status: 401, text: () => Promise.resolve("Unauthorized") } as any);

      await expect(protocol.chat([], [])).rejects.toThrow("LLM API error (401)");
    });
  });

  describe("chatStream()", () => {
    it("yields content chunks", async () => {
      const protocol = makeProtocol();
      const sseData = [
        'data: {"choices":[{"delta":{"content":"Hello "}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"world"}}]}\n\n',
        'data: [DONE]\n\n',
      ];
      mockFetch.mockResolvedValue(mockSSEStream(sseData));

      const chunks: string[] = [];
      for await (const chunk of protocol.chatStream([], [])) {
        if (chunk.content) chunks.push(chunk.content);
      }

      expect(chunks).toEqual(["Hello ", "world"]);
    });

    it("yields thinking chunks", async () => {
      const protocol = makeProtocol();
      const sseData = [
        'data: {"choices":[{"delta":{"reasoning_content":"Let me "}}]}\n\n',
        'data: {"choices":[{"delta":{"reasoning_content":"think..."}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"Answer"}}]}\n\n',
        'data: [DONE]\n\n',
      ];
      mockFetch.mockResolvedValue(mockSSEStream(sseData));

      const thinking: string[] = [];
      const content: string[] = [];
      for await (const chunk of protocol.chatStream([], [])) {
        if (chunk.thinking) thinking.push(chunk.thinking);
        if (chunk.content) content.push(chunk.content);
      }

      expect(thinking).toEqual(["Let me ", "think..."]);
      expect(content).toEqual(["Answer"]);
    });

    it("accumulates tool calls across chunks", async () => {
      const protocol = makeProtocol();
      const sseData = [
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"c1","function":{"name":"search"}}]}}]}\n\n',
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\\"q\\":"}}]}}]}\n\n',
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\\"test\\"}"}}]}}]}\n\n',
        'data: {"choices":[{"finish_reason":"tool_calls"}]}\n\n',
        'data: [DONE]\n\n',
      ];
      mockFetch.mockResolvedValue(mockSSEStream(sseData));

      const chunks: any[] = [];
      for await (const chunk of protocol.chatStream([], [])) {
        if (chunk.toolCalls) chunks.push(chunk);
      }

      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks[0].toolCalls[0].id).toBe("c1");
      expect(chunks[0].toolCalls[0].name).toBe("search");
    });
  });

  describe("countTokens()", () => {
    it("returns approximate count", () => {
      const protocol = makeProtocol();
      expect(protocol.countTokens("Hello")).toBe(2);
      expect(protocol.countTokens("a")).toBe(1);
    });
  });
});
