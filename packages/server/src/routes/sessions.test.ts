import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ProteusServer, createServer } from "../server.js";
import type { SessionConfig } from "@proteus/core";
import { InMemoryCheckpointStore } from "@proteus/core";

function makeConfig(overrides?: Partial<SessionConfig>): SessionConfig {
  return {
    sessionId: "test-session",
    llm: {
      provider: "openai",
      model: "gpt-4o",
      temperature: 0.7,
    },
    tools: {},
    logLevel: "info",
    ...overrides,
  };
}

describe("Session routes", () => {
  let server: ProteusServer;

  afterEach(async () => {
    if (server) {
      await server.stop();
    }
  });

  // --- POST /sessions ---

  describe("POST /sessions", () => {
    it("creates a session and returns 201", async () => {
      server = createServer({ port: 0, store: new InMemoryCheckpointStore() });
      await server.start();

      const config = makeConfig();
      const response = await server.instance.inject({
        method: "POST",
        url: "/sessions",
        payload: { sessionId: "s1", config },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(body.sessionId).toBe("s1");
      expect(body.config).toEqual(config);
    });

    it("returns 409 when session already exists", async () => {
      server = createServer({ port: 0, store: new InMemoryCheckpointStore() });
      await server.start();

      const config = makeConfig();
      await server.instance.inject({
        method: "POST",
        url: "/sessions",
        payload: { sessionId: "dup", config },
      });

      const response = await server.instance.inject({
        method: "POST",
        url: "/sessions",
        payload: { sessionId: "dup", config },
      });

      expect(response.statusCode).toBe(409);
      const body = response.json();
      expect(body.error).toBe("Conflict");
      expect(body.message).toContain("already exists");
    });

    it("returns 400 when body is missing fields", async () => {
      server = createServer({ port: 0, store: new InMemoryCheckpointStore() });
      await server.start();

      const response = await server.instance.inject({
        method: "POST",
        url: "/sessions",
        payload: { sessionId: "x" }, // missing config
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.error).toBe("Bad Request");
    });
  });

  // --- GET /sessions ---

  describe("GET /sessions", () => {
    it("returns empty list when no sessions exist", async () => {
      server = createServer({ port: 0, store: new InMemoryCheckpointStore() });
      await server.start();

      const response = await server.instance.inject({
        method: "GET",
        url: "/sessions",
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.sessions).toEqual([]);
    });

    it("lists created sessions", async () => {
      server = createServer({ port: 0, store: new InMemoryCheckpointStore() });
      await server.start();

      const config = makeConfig();
      await server.instance.inject({
        method: "POST",
        url: "/sessions",
        payload: { sessionId: "a", config },
      });
      await server.instance.inject({
        method: "POST",
        url: "/sessions",
        payload: { sessionId: "b", config },
      });

      const response = await server.instance.inject({
        method: "GET",
        url: "/sessions",
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.sessions).toContain("a");
      expect(body.sessions).toContain("b");
    });
  });

  // --- GET /sessions/:id ---

  describe("GET /sessions/:id", () => {
    it("returns a session by ID", async () => {
      server = createServer({ port: 0, store: new InMemoryCheckpointStore() });
      await server.start();

      const config = makeConfig({ sessionId: "s1" });
      await server.instance.inject({
        method: "POST",
        url: "/sessions",
        payload: { sessionId: "s1", config },
      });

      const response = await server.instance.inject({
        method: "GET",
        url: "/sessions/s1",
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.sessionId).toBe("s1");
      expect(body.config).toEqual(config);
    });

    it("returns 404 for non-existent session", async () => {
      server = createServer({ port: 0, store: new InMemoryCheckpointStore() });
      await server.start();

      const response = await server.instance.inject({
        method: "GET",
        url: "/sessions/missing",
      });

      expect(response.statusCode).toBe(404);
      const body = response.json();
      expect(body.error).toBe("Not Found");
      expect(body.message).toContain("missing");
    });
  });

  // --- DELETE /sessions/:id ---

  describe("DELETE /sessions/:id", () => {
    it("deletes a session and returns 204", async () => {
      server = createServer({ port: 0, store: new InMemoryCheckpointStore() });
      await server.start();

      const config = makeConfig();
      await server.instance.inject({
        method: "POST",
        url: "/sessions",
        payload: { sessionId: "del", config },
      });

      const response = await server.instance.inject({
        method: "DELETE",
        url: "/sessions/del",
      });

      expect(response.statusCode).toBe(204);

      // Verify it's gone
      const getResponse = await server.instance.inject({
        method: "GET",
        url: "/sessions/del",
      });
      expect(getResponse.statusCode).toBe(404);
    });

    it("returns 404 when session does not exist", async () => {
      server = createServer({ port: 0, store: new InMemoryCheckpointStore() });
      await server.start();

      const response = await server.instance.inject({
        method: "DELETE",
        url: "/sessions/ghost",
      });

      expect(response.statusCode).toBe(404);
      const body = response.json();
      expect(body.error).toBe("Not Found");
    });
  });
});
