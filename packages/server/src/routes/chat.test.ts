import { describe, it, expect } from "vitest";
import { createServer } from "../server.js";
import type { LLMProvider, LLMResponse } from "@proteus/core";

function mockLLM(response = "Hello from the mock LLM!"): LLMProvider {
  return {
    chat: async () => ({
      content: response,
      usage: { promptTokens: 10, completionTokens: 5 },
      finishReason: "stop" as const,
    }),
    chatStream: async function* (): AsyncIterable<LLMResponse> {
      yield {
        content: response,
        usage: { promptTokens: 10, completionTokens: 5 },
        finishReason: "stop",
      };
    },
    countTokens: () => 0,
  };
}

describe("POST /api/chat", () => {
  it("returns response for a valid session", async () => {
    const server = createServer({
      llm: mockLLM("Sure, I can help with that!"),
    });

    // Create a session first
    server.sessionManager.create("test-session", {
      sessionId: "test-session",
      llm: { provider: "mock", model: "mock-1", temperature: 0 },
      tools: {},
      logLevel: "info",
    });

    const res = await server.instance.inject({
      method: "POST",
      url: "/api/chat",
      payload: { sessionId: "test-session", message: "Hello" },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.turnId).toBeDefined();
    expect(body.status).toBe("completed");
    expect(body.response).toBe("Sure, I can help with that!");

    await server.stop();
  });

  it("returns 404 when session not found", async () => {
    const server = createServer({ llm: mockLLM() });

    const res = await server.instance.inject({
      method: "POST",
      url: "/api/chat",
      payload: { sessionId: "nonexistent", message: "Hello" },
    });

    expect(res.statusCode).toBe(404);
    const body = res.json();
    expect(body.error).toBe("Not Found");
    expect(body.message).toContain("nonexistent");

    await server.stop();
  });

  it("returns 400 when body is missing fields", async () => {
    const server = createServer({ llm: mockLLM() });

    const res = await server.instance.inject({
      method: "POST",
      url: "/api/chat",
      payload: { sessionId: "s1" },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error).toBe("Bad Request");

    await server.stop();
  });

  it("chat route is not registered when LLM is not configured", async () => {
    const server = createServer(); // no llm

    const res = await server.instance.inject({
      method: "POST",
      url: "/api/chat",
      payload: { sessionId: "s1", message: "Hello" },
    });

    expect(res.statusCode).toBe(404); // Fastify returns 404 for unregistered routes

    await server.stop();
  });
});
