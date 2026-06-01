// @proteus/server — API tests for enhanced /api/traces endpoints
// Uses vitest with Fastify inject for fast, isolated HTTP testing.

import { describe, it, expect, beforeEach } from "vitest";
import Fastify from "fastify";
import { registerMetricsRoutes } from "../routes/metrics.js";
import type { EventLog, SessionStore } from "@proteus/core";
import { InMemoryEventLog, InMemorySessionStore } from "@proteus/core";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createTestEventLog(): EventLog {
  return new InMemoryEventLog();
}

function createTestSessionStore(): SessionStore {
  return new InMemorySessionStore();
}

async function createApp(eventLog?: EventLog, sessionStore?: SessionStore) {
  const app = Fastify();
  await registerMetricsRoutes(app, {
    eventLog: eventLog ?? createTestEventLog(),
    sessionStore: sessionStore ?? createTestSessionStore(),
  });
  return app;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GET /api/traces", () => {
  let eventLog: InMemoryEventLog;

  beforeEach(() => {
    eventLog = new InMemoryEventLog();
  });

  it("returns empty paginated response when no events", async () => {
    const app = await createApp(eventLog);
    const res = await app.inject({ method: "GET", url: "/traces" });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.data).toEqual([]);
    expect(body.total).toBe(0);
    expect(body.page).toBe(1);
    expect(body.limit).toBe(25);
    expect(body.hasMore).toBe(false);
  });

  it("returns paginated traces from events", async () => {
    // Seed some events
    eventLog.appendEvent({
      sessionId: "trace-1",
      event: "turn:start",
      timestamp: 1000,
    });
    eventLog.appendEvent({
      sessionId: "trace-1",
      event: "turn:end",
      timestamp: 2000,
    });
    eventLog.appendEvent({
      sessionId: "trace-2",
      event: "turn:start",
      timestamp: 3000,
    });

    const app = await createApp(eventLog);
    const res = await app.inject({ method: "GET", url: "/traces" });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.data).toHaveLength(2);
    expect(body.total).toBe(2);
    expect(body.hasMore).toBe(false);
  });

  it("supports pagination with page and limit", async () => {
    // Seed 30 events
    for (let i = 0; i < 30; i++) {
      eventLog.appendEvent({
        sessionId: `trace-${i}`,
        event: "turn:start",
        timestamp: 1000 + i,
      });
    }

    const app = await createApp(eventLog);

    // Page 1, limit 10
    const res1 = await app.inject({ method: "GET", url: "/traces?page=1&limit=10" });
    const body1 = JSON.parse(res1.payload);
    expect(body1.data).toHaveLength(10);
    expect(body1.page).toBe(1);
    expect(body1.limit).toBe(10);
    expect(body1.hasMore).toBe(true);
    expect(body1.total).toBe(30);

    // Page 2, limit 10
    const res2 = await app.inject({ method: "GET", url: "/traces?page=2&limit=10" });
    const body2 = JSON.parse(res2.payload);
    expect(body2.data).toHaveLength(10);
    expect(body2.page).toBe(2);
  });

  it("supports delta mode with since parameter", async () => {
    eventLog.appendEvent({
      sessionId: "trace-old",
      event: "turn:start",
      timestamp: 1000,
    });
    eventLog.appendEvent({
      sessionId: "trace-new",
      event: "turn:start",
      timestamp: 5000,
    });

    const app = await createApp(eventLog);
    const res = await app.inject({
      method: "GET",
      url: "/traces?mode=delta&since=2000",
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].traceId).toBe("trace-new");
  });
});
