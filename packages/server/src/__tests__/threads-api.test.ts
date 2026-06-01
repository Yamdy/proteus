// @proteus/server — API tests for /api/threads endpoints
// Uses vitest with Fastify inject for fast, isolated HTTP testing.

import { describe, it, expect } from "vitest";
import Fastify from "fastify";
import type { SessionManager } from "@proteus/core";
import { sessionRoutes } from "../routes/sessions.js";

// ---------------------------------------------------------------------------
// Helpers: build a fresh Fastify app with mocked SessionManager per test
// ---------------------------------------------------------------------------

interface MockSession {
  config: { name?: string; createdAt?: number };
  workingMemory: { getMessages: () => unknown[] };
}

function createMockSessionManager() {
  const sessions = new Map<string, MockSession>();

  return {
    create(sessionId: string, config: Record<string, unknown>) {
      if (sessions.has(sessionId)) {
        throw new Error(`Session "${sessionId}" already exists`);
      }
      const session: MockSession = {
        config: {
          name: config.name as string | undefined,
          createdAt: config.createdAt as number | undefined,
        },
        workingMemory: { getMessages: () => [] },
      };
      sessions.set(sessionId, session);
      return session;
    },
    get(sessionId: string) {
      return sessions.get(sessionId);
    },
    destroy(sessionId: string) {
      sessions.delete(sessionId);
    },
    list() {
      return [...sessions.keys()];
    },
  };
}

async function buildApp(sessionManager: ReturnType<typeof createMockSessionManager>) {
  const app = Fastify();
  await app.register(sessionRoutes, {
    prefix: "/api/threads",
    sessionManager: sessionManager as unknown as SessionManager,
  });
  return app;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /api/threads", () => {
  it("creates a session and returns 201 with id, name, createdAt", async () => {
    const sm = createMockSessionManager();
    const app = await buildApp(sm);
    try {
      const res = await app.inject({
        method: "POST",
        url: "/api/threads",
        payload: { name: "my-thread" },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body).toHaveProperty("id");
      expect(body.name).toBe("my-thread");
      expect(body).toHaveProperty("createdAt");
    } finally {
      await app.close();
    }
  });

  it("generates an id when none is provided", async () => {
    const sm = createMockSessionManager();
    const app = await buildApp(sm);
    try {
      const res = await app.inject({ method: "POST", url: "/api/threads", payload: {} });
      expect(res.statusCode).toBe(201);
      expect(res.json().id).toMatch(/^sess-/);
    } finally {
      await app.close();
    }
  });

  it("accepts a custom sessionId", async () => {
    const sm = createMockSessionManager();
    const app = await buildApp(sm);
    try {
      const res = await app.inject({
        method: "POST",
        url: "/api/threads",
        payload: { sessionId: "custom-id", name: "custom" },
      });

      expect(res.statusCode).toBe(201);
      expect(res.json().id).toBe("custom-id");
    } finally {
      await app.close();
    }
  });

  it("returns 409 when session already exists", async () => {
    const sm = createMockSessionManager();
    const app = await buildApp(sm);
    try {
      await app.inject({ method: "POST", url: "/api/threads", payload: { sessionId: "dup" } });
      const res = await app.inject({
        method: "POST",
        url: "/api/threads",
        payload: { sessionId: "dup" },
      });

      expect(res.statusCode).toBe(409);
      expect(res.json().error).toBe("Conflict");
    } finally {
      await app.close();
    }
  });
});

describe("GET /api/threads", () => {
  it("returns an empty array when no sessions exist", async () => {
    const sm = createMockSessionManager();
    const app = await buildApp(sm);
    try {
      const res = await app.inject({ method: "GET", url: "/api/threads" });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual([]);
    } finally {
      await app.close();
    }
  });

  it("returns all created sessions", async () => {
    const sm = createMockSessionManager();
    const app = await buildApp(sm);
    try {
      await app.inject({
        method: "POST",
        url: "/api/threads",
        payload: { sessionId: "a", name: "A" },
      });
      await app.inject({
        method: "POST",
        url: "/api/threads",
        payload: { sessionId: "b", name: "B" },
      });

      const res = await app.inject({ method: "GET", url: "/api/threads" });
      const body = res.json();

      expect(res.statusCode).toBe(200);
      expect(body).toHaveLength(2);
      expect(body.map((s: { id: string }) => s.id).sort()).toEqual(["a", "b"]);
    } finally {
      await app.close();
    }
  });
});

describe("GET /api/threads/:id", () => {
  it("returns the session when it exists", async () => {
    const sm = createMockSessionManager();
    const app = await buildApp(sm);
    try {
      await app.inject({
        method: "POST",
        url: "/api/threads",
        payload: { sessionId: "s1", name: "S1" },
      });
      const res = await app.inject({ method: "GET", url: "/api/threads/s1" });

      expect(res.statusCode).toBe(200);
      expect(res.json().id).toBe("s1");
      expect(res.json().name).toBe("S1");
    } finally {
      await app.close();
    }
  });

  it("returns 404 for a non-existent session", async () => {
    const sm = createMockSessionManager();
    const app = await buildApp(sm);
    try {
      const res = await app.inject({ method: "GET", url: "/api/threads/does-not-exist" });

      expect(res.statusCode).toBe(404);
      expect(res.json().error).toBe("Not Found");
    } finally {
      await app.close();
    }
  });
});

describe("DELETE /api/threads/:id", () => {
  it("deletes an existing session and returns 204", async () => {
    const sm = createMockSessionManager();
    const app = await buildApp(sm);
    try {
      await app.inject({
        method: "POST",
        url: "/api/threads",
        payload: { sessionId: "del1" },
      });
      const res = await app.inject({ method: "DELETE", url: "/api/threads/del1" });

      expect(res.statusCode).toBe(204);

      // Confirm it is gone
      const getRes = await app.inject({ method: "GET", url: "/api/threads/del1" });
      expect(getRes.statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });

  it("returns 404 when deleting a non-existent session", async () => {
    const sm = createMockSessionManager();
    const app = await buildApp(sm);
    try {
      const res = await app.inject({ method: "DELETE", url: "/api/threads/ghost" });

      expect(res.statusCode).toBe(404);
      expect(res.json().error).toBe("Not Found");
    } finally {
      await app.close();
    }
  });
});

describe("GET /api/threads/:id/messages", () => {
  it("returns messages for an existing session", async () => {
    const sm = createMockSessionManager();
    const app = await buildApp(sm);
    try {
      await app.inject({
        method: "POST",
        url: "/api/threads",
        payload: { sessionId: "msg1" },
      });
      const res = await app.inject({ method: "GET", url: "/api/threads/msg1/messages" });

      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.json())).toBe(true);
    } finally {
      await app.close();
    }
  });

  it("returns 404 for a non-existent session", async () => {
    const sm = createMockSessionManager();
    const app = await buildApp(sm);
    try {
      const res = await app.inject({ method: "GET", url: "/api/threads/nope/messages" });

      expect(res.statusCode).toBe(404);
      expect(res.json().error).toBe("Not Found");
    } finally {
      await app.close();
    }
  });
});
