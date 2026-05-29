import { describe, it, expect, beforeEach, afterEach } from "vitest";
import http from "node:http";
import { ChatServer } from "./chat-server.js";
import { InMemoryCheckpointStore } from "./checkpoint-store.js";
import { HandlerEngine } from "./handler-engine.js";
import { registerBuiltInProcessors } from "./processors.js";
import type { LLMProvider, SessionConfig } from "./index.js";

function stubLLM(overrides?: Partial<LLMProvider>): LLMProvider {
  return {
    chat: overrides?.chat ?? (async () => ({
      content: "Agent response",
      toolCalls: [],
      usage: { promptTokens: 10, completionTokens: 5 },
      finishReason: "stop" as const,
    })),
    chatStream: overrides?.chatStream ?? (async function* () {
      yield { content: "Agent response", usage: { promptTokens: 10, completionTokens: 5 }, finishReason: "stop" as const };
    }),
    countTokens: overrides?.countTokens ?? ((text: string) => Math.ceil(text.length / 4)),
  };
}

function testConfig(sessionId: string): SessionConfig {
  return {
    sessionId,
    llm: { provider: "openai", model: "gpt-4o", temperature: 0 },
    tools: {},
    logLevel: "info",
  };
}

function request(port: number, method: string, path: string, body?: unknown): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : "";
    const req = http.request({ hostname: "127.0.0.1", port, path, method, headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) } }, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => resolve({ status: res.statusCode!, body }));
    });
    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}

describe("ChatServer", () => {
  let server: ChatServer;
  let port: number;

  beforeEach(async () => {
    const store = new InMemoryCheckpointStore();
    const engine = new HandlerEngine();
    registerBuiltInProcessors(engine);
    server = new ChatServer({
      port: 0,
      llm: stubLLM(),
      store,
      engine,
    });
    const addr = await server.start();
    port = typeof addr === "string" ? parseInt(addr) : addr.port;
  });

  afterEach(async () => {
    await server.close();
  });

  describe("POST /sessions", () => {
    it("creates a new session", async () => {
      const res = await request(port, "POST", "/sessions", { sessionId: "s1", config: testConfig("s1") });
      expect(res.status).toBe(201);
      const data = JSON.parse(res.body);
      expect(data.sessionId).toBe("s1");
    });

    it("returns 409 on duplicate session", async () => {
      await request(port, "POST", "/sessions", { sessionId: "s1", config: testConfig("s1") });
      const res = await request(port, "POST", "/sessions", { sessionId: "s1", config: testConfig("s1") });
      expect(res.status).toBe(409);
    });
  });

  describe("GET /sessions", () => {
    it("lists active sessions", async () => {
      await request(port, "POST", "/sessions", { sessionId: "s1", config: testConfig("s1") });
      await request(port, "POST", "/sessions", { sessionId: "s2", config: testConfig("s2") });
      const res = await request(port, "GET", "/sessions");
      expect(res.status).toBe(200);
      const data = JSON.parse(res.body);
      expect(data.sessions.sort()).toEqual(["s1", "s2"]);
    });
  });

  describe("DELETE /sessions/:id", () => {
    it("destroys a session", async () => {
      await request(port, "POST", "/sessions", { sessionId: "s1", config: testConfig("s1") });
      const res = await request(port, "DELETE", "/sessions/s1");
      expect(res.status).toBe(200);
      const list = await request(port, "GET", "/sessions");
      expect(JSON.parse(list.body).sessions).toEqual([]);
    });

    it("returns 404 for unknown session", async () => {
      const res = await request(port, "DELETE", "/sessions/unknown");
      expect(res.status).toBe(404);
    });
  });

  describe("POST /chat", () => {
    it("accepts message and returns agent response", async () => {
      await request(port, "POST", "/sessions", { sessionId: "s1", config: testConfig("s1") });
      const res = await request(port, "POST", "/chat", { message: "Hello", sessionId: "s1" });
      expect(res.status).toBe(200);
      const data = JSON.parse(res.body);
      expect(data.response).toBe("Agent response");
      expect(data.sessionId).toBe("s1");
    });

    it("creates a default session if sessionId not provided", async () => {
      const res = await request(port, "POST", "/chat", { message: "Hello" });
      expect(res.status).toBe(200);
      const data = JSON.parse(res.body);
      expect(data.sessionId).toBeDefined();
    });

    it("returns 400 if message is missing", async () => {
      const res = await request(port, "POST", "/chat", {});
      expect(res.status).toBe(400);
    });
  });

  describe("GET /events (SSE)", () => {
    it("returns SSE headers", async () => {
      const res = await new Promise<http.IncomingMessage>((resolve) => {
        const req = http.get({ hostname: "127.0.0.1", port, path: "/events" }, resolve);
        req.on("error", () => {});
      });
      expect(res.headers["content-type"]).toContain("text/event-stream");
      res.destroy();
    });
  });
});

describe("ChatServer Health Endpoint", () => {
  let server: ChatServer;
  let port: number;

  beforeEach(async () => {
    const store = new InMemoryCheckpointStore();
    const engine = new HandlerEngine();
    registerBuiltInProcessors(engine);
    server = new ChatServer({ port: 0, llm: stubLLM(), store, engine });
    const addr = await server.start();
    port = typeof addr === "string" ? parseInt(addr) : addr.port;
  });

  afterEach(async () => {
    await server.close();
  });

  function request(port: number, method: string, path: string): Promise<{ status: number; body: string }> {
    return new Promise((resolve, reject) => {
      const req = http.request({ hostname: "127.0.0.1", port, method, path }, (res) => {
        let body = "";
        res.on("data", (chunk) => { body += chunk; });
        res.on("end", () => resolve({ status: res.statusCode ?? 0, body }));
      });
      req.on("error", reject);
      req.end();
    });
  }

  it("returns 200 with health response fields", async () => {
    const res = await request(port, "GET", "/health");
    expect(res.status).toBe(200);
    const data = JSON.parse(res.body);
    expect(data).toHaveProperty("status");
    expect(data).toHaveProperty("uptime");
    expect(data).toHaveProperty("activeChains");
    expect(data).toHaveProperty("turnCount");
    expect(data).toHaveProperty("lastTurnDuration");
    expect(data).toHaveProperty("costTotals");
    expect(data).toHaveProperty("handlerCount");
    expect(data).toHaveProperty("sessionId");
    expect(data).toHaveProperty("timestamp");
  });

  it("returns healthy status when no activity", async () => {
    const res = await request(port, "GET", "/health");
    const data = JSON.parse(res.body);
    expect(data.status).toBe("healthy");
  });
});
