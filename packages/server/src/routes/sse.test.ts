import { describe, it, expect } from "vitest";
import { createServer } from "../server.js";
import type { LLMProvider, LLMResponse } from "@proteus/core";

function mockLLM(chunks: string[] = ["Hello", " from", " the", " mock", " LLM!"]): LLMProvider {
  return {
    chat: async () => ({
      content: chunks.join(""),
      usage: { promptTokens: 10, completionTokens: 5 },
      finishReason: "stop" as const,
    }),
    chatStream: async function* (): AsyncIterable<LLMResponse> {
      for (const chunk of chunks) {
        yield {
          content: chunk,
          usage: { promptTokens: 10, completionTokens: 5 },
          finishReason: "stop",
        };
      }
    },
    countTokens: () => 0,
  };
}

function mockLLMWithError(errorMsg: string): LLMProvider {
  return {
    chat: async () => ({
      content: "",
      usage: { promptTokens: 0, completionTokens: 0 },
      finishReason: "error" as const,
    }),
    chatStream: async function* (): AsyncIterable<LLMResponse> {
      throw new Error(errorMsg);
    },
    countTokens: () => 0,
  };
}

describe("GET /chat/:sessionId/stream (SSE)", () => {
  it("streams chunk events and a done event for a valid session", async () => {
    const server = createServer({
      llm: mockLLM(["Hello", " world"]),
    });

    server.sessionManager.create("test-session", {
      sessionId: "test-session",
      llm: { provider: "mock", model: "mock-1", temperature: 0 },
      tools: {},
      logLevel: "info",
    });

    const res = await server.instance.inject({
      method: "GET",
      url: "/chat/test-session/stream?message=Hi",
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/event-stream");

    const events = parseSseEvents(res.body);

    expect(events).toHaveLength(3);

    expect(events[0]).toMatchObject({ event: "chunk", content: "Hello" });
    expect(events[1]).toMatchObject({ event: "chunk", content: " world" });

    // Done event (metadata only — content already streamed via chunks)
    expect(events[2]).toMatchObject({ event: "done", finishReason: "stop" });
    expect(events[2].usage).toBeDefined();

    await server.stop();
  });

  it("returns 400 when message query parameter is missing", async () => {
    const server = createServer({ llm: mockLLM() });

    server.sessionManager.create("s1", {
      sessionId: "s1",
      llm: { provider: "mock", model: "mock-1", temperature: 0 },
      tools: {},
      logLevel: "info",
    });

    const res = await server.instance.inject({
      method: "GET",
      url: "/chat/s1/stream",
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error).toBe("Bad Request");
    expect(body.message).toContain("message");

    await server.stop();
  });

  it("returns 404 when session not found", async () => {
    const server = createServer({ llm: mockLLM() });

    const res = await server.instance.inject({
      method: "GET",
      url: "/chat/nonexistent/stream?message=Hello",
    });

    expect(res.statusCode).toBe(404);
    const body = res.json();
    expect(body.error).toBe("Not Found");
    expect(body.message).toContain("nonexistent");

    await server.stop();
  });

  it("sends error event when LLM stream throws", async () => {
    const server = createServer({
      llm: mockLLMWithError("LLM exploded"),
    });

    server.sessionManager.create("s1", {
      sessionId: "s1",
      llm: { provider: "mock", model: "mock-1", temperature: 0 },
      tools: {},
      logLevel: "info",
    });

    const res = await server.instance.inject({
      method: "GET",
      url: "/chat/s1/stream?message=Hello",
    });

    expect(res.statusCode).toBe(200);
    const events = parseSseEvents(res.body);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      event: "error",
      message: "LLM exploded",
    });

    await server.stop();
  });

  it("SSE route is not registered when LLM is not configured", async () => {
    const server = createServer();

    const res = await server.instance.inject({
      method: "GET",
      url: "/chat/s1/stream?message=Hello",
    });

    expect(res.statusCode).toBe(404);

    await server.stop();
  });

  it("pushes user message into working memory via Harness", async () => {
    const server = createServer({
      llm: mockLLM(["Sure!"]),
    });

    server.sessionManager.create("s1", {
      sessionId: "s1",
      llm: { provider: "mock", model: "mock-1", temperature: 0 },
      tools: {},
      logLevel: "info",
    });

    await server.instance.inject({
      method: "GET",
      url: "/chat/s1/stream?message=Hello",
    });

    const session = server.sessionManager.get("s1")!;
    const messages = session.workingMemory.getMessages();

    expect(messages.length).toBeGreaterThanOrEqual(1);
    expect(messages[0]).toMatchObject({ role: "user", content: "Hello" });

    await server.stop();
  });
});

/** Parse `data: JSON\n\n` SSE events from a response body string. */
function parseSseEvents(body: string): Array<Record<string, unknown>> {
  const events: Array<Record<string, unknown>> = [];
  const lines = body.split("\n");
  for (const line of lines) {
    if (line.startsWith("data: ")) {
      const json = line.slice(6).trim();
      if (json) {
        events.push(JSON.parse(json));
      }
    }
  }
  return events;
}
