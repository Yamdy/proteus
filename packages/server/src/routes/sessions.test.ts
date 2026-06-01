import { describe, it, expect, afterEach } from "vitest";
import { ProteusServer, createServer } from "../server.js";
import { createInMemoryStore } from "@proteus/core";

describe("Session routes", () => {
  let server: ProteusServer;

  afterEach(async () => {
    if (server) {
      await server.stop();
    }
  });

  // --- POST /api/sessions ---

  describe("POST /api/sessions", () => {
    it("creates a session and returns 201", async () => {
      server = createServer({ port: 0, store: createInMemoryStore() });
      await server.start();

      const response = await server.instance.inject({
        method: "POST",
        url: "/api/sessions",
        payload: { name: "test-session" },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(body.id).toBeDefined();
      expect(body.name).toBe("test-session");
    });

    it("returns 409 when session already exists", async () => {
      server = createServer({ port: 0, store: createInMemoryStore() });
      await server.start();

      await server.instance.inject({
        method: "POST",
        url: "/api/sessions",
        payload: { sessionId: "dup", name: "dup" },
      });

      const response = await server.instance.inject({
        method: "POST",
        url: "/api/sessions",
        payload: { sessionId: "dup", name: "dup" },
      });

      expect(response.statusCode).toBe(409);
      const body = response.json();
      expect(body.error).toBe("Conflict");
      expect(body.message).toContain("already exists");
    });
  });

  // --- GET /api/sessions ---

  describe("GET /api/sessions", () => {
    it("returns empty list when no sessions exist", async () => {
      server = createServer({ port: 0, store: createInMemoryStore() });
      await server.start();

      const response = await server.instance.inject({
        method: "GET",
        url: "/api/sessions",
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body).toEqual([]);
    });

    it("lists created sessions", async () => {
      server = createServer({ port: 0, store: createInMemoryStore() });
      await server.start();

      await server.instance.inject({
        method: "POST",
        url: "/api/sessions",
        payload: { sessionId: "a", name: "a" },
      });
      await server.instance.inject({
        method: "POST",
        url: "/api/sessions",
        payload: { sessionId: "b", name: "b" },
      });

      const response = await server.instance.inject({
        method: "GET",
        url: "/api/sessions",
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body).toHaveLength(2);
      expect(body.map((s: any) => s.id)).toContain("a");
      expect(body.map((s: any) => s.id)).toContain("b");
    });
  });

  // --- GET /api/sessions/:id ---

  describe("GET /api/sessions/:id", () => {
    it("returns a session by ID", async () => {
      server = createServer({ port: 0, store: createInMemoryStore() });
      await server.start();

      await server.instance.inject({
        method: "POST",
        url: "/api/sessions",
        payload: { sessionId: "s1", name: "session-1" },
      });

      const response = await server.instance.inject({
        method: "GET",
        url: "/api/sessions/s1",
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.id).toBe("s1");
      expect(body.name).toBe("session-1");
    });

    it("returns 404 for non-existent session", async () => {
      server = createServer({ port: 0, store: createInMemoryStore() });
      await server.start();

      const response = await server.instance.inject({
        method: "GET",
        url: "/api/sessions/missing",
      });

      expect(response.statusCode).toBe(404);
      const body = response.json();
      expect(body.error).toBe("Not Found");
      expect(body.message).toContain("missing");
    });
  });

  // --- DELETE /api/sessions/:id ---

  describe("DELETE /api/sessions/:id", () => {
    it("deletes a session and returns 204", async () => {
      server = createServer({ port: 0, store: createInMemoryStore() });
      await server.start();

      await server.instance.inject({
        method: "POST",
        url: "/api/sessions",
        payload: { sessionId: "del", name: "to-delete" },
      });

      const response = await server.instance.inject({
        method: "DELETE",
        url: "/api/sessions/del",
      });

      expect(response.statusCode).toBe(204);

      // Verify it's gone
      const getResponse = await server.instance.inject({
        method: "GET",
        url: "/api/sessions/del",
      });
      expect(getResponse.statusCode).toBe(404);
    });

    it("returns 404 when session does not exist", async () => {
      server = createServer({ port: 0, store: createInMemoryStore() });
      await server.start();

      const response = await server.instance.inject({
        method: "DELETE",
        url: "/api/sessions/ghost",
      });

      expect(response.statusCode).toBe(404);
      const body = response.json();
      expect(body.error).toBe("Not Found");
    });
  });
});
