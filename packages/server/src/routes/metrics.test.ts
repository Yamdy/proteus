import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ProteusServer } from "../server.js";
import {
  MetricsCollector,
  InMemoryCostStore,
  InMemoryEventLog,
  InMemorySessionStore,
} from "@proteus/core";

describe("Metrics / Costs / Traces / Health routes", () => {
  let server: ProteusServer;
  let metrics: MetricsCollector;
  let costStore: InMemoryCostStore;
  let eventLog: InMemoryEventLog;
  let sessionStore: InMemorySessionStore;

  beforeEach(() => {
    metrics = new MetricsCollector();
    costStore = new InMemoryCostStore();
    eventLog = new InMemoryEventLog();
    sessionStore = new InMemorySessionStore();
  });

  afterEach(async () => {
    if (server) {
      await server.stop();
    }
  });

  async function createAndStart(
    overrides: Partial<{
      metrics: MetricsCollector;
      costStore: InMemoryCostStore;
      eventLog: InMemoryEventLog;
      sessionStore: InMemorySessionStore;
      handlerCount: number;
    }> = {},
  ) {
    server = new ProteusServer({
      port: 0,
      metrics: overrides.metrics ?? metrics,
      costStore: overrides.costStore ?? costStore,
      eventLog: overrides.eventLog ?? eventLog,
      sessionStore: overrides.sessionStore ?? sessionStore,
      handlerCount: overrides.handlerCount ?? 5,
    });
    await server.start();
    return server.instance;
  }

  // ---- GET /api/metrics ----

  describe("GET /api/metrics", () => {
    it("returns metrics snapshot with zeroed defaults", async () => {
      await createAndStart();

      const res = await server.instance.inject({
        method: "GET",
        url: "/api/metrics",
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.totalTraces).toBe(0);
      expect(body.totalSpans).toBe(0);
      expect(body.averageLatencyMs).toBe(0);
      expect(body.errorRate).toBe(0);
      expect(body.phaseBreakdown).toBeDefined();
      expect(body.toolCallStats).toEqual([]);
    });

    it("reflects populated metrics", async () => {
      metrics.handleTurnStart({ turnId: "t1", sessionId: "s1" });
      metrics.handleTurnEnd({ turnId: "t1", status: "completed" });

      await createAndStart();

      const res = await server.instance.inject({
        method: "GET",
        url: "/api/metrics",
      });

      const body = res.json();
      expect(body.totalTraces).toBe(1);
      expect(body.averageLatencyMs).toBeGreaterThanOrEqual(0);
    });
  });

  // ---- GET /api/costs ----

  describe("GET /api/costs", () => {
    it("returns empty summary when no data exists", async () => {
      await createAndStart();

      const res = await server.instance.inject({
        method: "GET",
        url: "/api/costs",
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.totalCostUsd).toBe(0);
      expect(body.totalTokens).toBe(0);
      expect(body.bySession).toEqual([]);
      expect(body.byModel).toEqual([]);
      expect(body.byTurn).toEqual([]);
    });

    it("returns aggregated costs across sessions", async () => {
      sessionStore.createSession({ sessionId: "s1", config: {} as any });
      sessionStore.createSession({ sessionId: "s2", config: {} as any });

      costStore.addCostRecord({
        sessionId: "s1",
        turnId: "t1",
        promptTokens: 100,
        completionTokens: 50,
        timestamp: 1000,
      });
      costStore.addCostRecord({
        sessionId: "s2",
        turnId: "t2",
        promptTokens: 200,
        completionTokens: 80,
        timestamp: 2000,
      });

      await createAndStart();

      const res = await server.instance.inject({
        method: "GET",
        url: "/api/costs",
      });

      const body = res.json();
      expect(body.byTurn).toHaveLength(2);
      expect(body.totalTokens).toBe(430); // 100+50+200+80
      expect(body.bySession).toHaveLength(2);
    });
  });

  // ---- GET /api/costs/:sessionId ----

  describe("GET /api/costs/:sessionId", () => {
    it("returns empty records for unknown session", async () => {
      await createAndStart();

      const res = await server.instance.inject({
        method: "GET",
        url: "/api/costs/unknown",
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.byTurn).toEqual([]);
      expect(body.totalTokens).toBe(0);
    });

    it("returns cost records for a specific session", async () => {
      costStore.addCostRecord({
        sessionId: "s1",
        turnId: "t1",
        promptTokens: 100,
        completionTokens: 50,
        timestamp: 1000,
      });
      costStore.addCostRecord({
        sessionId: "s1",
        turnId: "t2",
        promptTokens: 200,
        completionTokens: 80,
        timestamp: 2000,
      });
      // Different session — should not appear
      costStore.addCostRecord({
        sessionId: "s2",
        turnId: "t3",
        promptTokens: 999,
        completionTokens: 999,
        timestamp: 3000,
      });

      await createAndStart();

      const res = await server.instance.inject({
        method: "GET",
        url: "/api/costs/s1",
      });

      const body = res.json();
      expect(body.byTurn).toHaveLength(2);
      expect(body.totalTokens).toBe(430); // 100+50+200+80
    });
  });

  // ---- GET /api/traces/:sessionId ----

  describe("GET /api/traces/:sessionId", () => {
    it("returns empty events for unknown session", async () => {
      await createAndStart();

      const res = await server.instance.inject({
        method: "GET",
        url: "/api/traces/unknown",
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.sessionId).toBe("unknown");
      expect(body.events).toEqual([]);
      expect(body.count).toBe(0);
    });

    it("returns events for a specific session", async () => {
      eventLog.appendEvent({
        sessionId: "s1",
        event: "turn:start",
        payload: { turnId: "t1" },
        timestamp: 1000,
      });
      eventLog.appendEvent({
        sessionId: "s1",
        event: "turn:end",
        payload: { turnId: "t1" },
        timestamp: 2000,
      });
      // Different session
      eventLog.appendEvent({
        sessionId: "s2",
        event: "turn:start",
        timestamp: 3000,
      });

      await createAndStart();

      const res = await server.instance.inject({
        method: "GET",
        url: "/api/traces/s1",
      });

      const body = res.json();
      expect(body.sessionId).toBe("s1");
      expect(body.events).toHaveLength(2);
      expect(body.count).toBe(2);
      expect(body.events[0].event).toBe("turn:start");
      expect(body.events[1].event).toBe("turn:end");
    });

    it("filters events by since query parameter", async () => {
      eventLog.appendEvent({
        sessionId: "s1",
        event: "old",
        timestamp: 1000,
      });
      eventLog.appendEvent({
        sessionId: "s1",
        event: "new",
        timestamp: 5000,
      });

      await createAndStart();

      const res = await server.instance.inject({
        method: "GET",
        url: "/api/traces/s1?since=3000",
      });

      const body = res.json();
      expect(body.events).toHaveLength(1);
      expect(body.events[0].event).toBe("new");
    });
  });

  // ---- GET /api/traces/:traceId/tool-calls ----

  describe("GET /api/traces/:traceId/tool-calls", () => {
    it("returns empty array for tool calls", async () => {
      await createAndStart();

      const res = await server.instance.inject({
        method: "GET",
        url: "/api/traces/trace1/tool-calls",
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual([]);
    });
  });

  // ---- GET /api/health/detailed ----

  describe("GET /api/health/detailed", () => {
    it("returns 503 when MetricsCollector is not provided", async () => {
      server = new ProteusServer({ port: 0 });
      await server.start();

      const res = await server.instance.inject({
        method: "GET",
        url: "/api/health/detailed",
      });

      expect(res.statusCode).toBe(503);
    });

    it("returns detailed health with defaults", async () => {
      await createAndStart({ handlerCount: 3 });

      const res = await server.instance.inject({
        method: "GET",
        url: "/api/health/detailed",
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.status).toBe("healthy");
      expect(body.turnCount).toBe(0);
      expect(body.activeChains).toBe(0);
      expect(body.costTotals).toEqual({
        promptTokens: 0,
        completionTokens: 0,
      });
      expect(body.handlerCount).toBe(3);
      expect(body.sessionId).toBe("server");
      expect(typeof body.uptime).toBe("number");
      expect(typeof body.timestamp).toBe("number");
    });

    it("returns degraded status after an errored turn", async () => {
      metrics.handleTurnStart({ turnId: "t1", sessionId: "s1" });
      metrics.handleTurnEnd({ turnId: "t1", status: "errored" });

      await createAndStart();

      const res = await server.instance.inject({
        method: "GET",
        url: "/api/health/detailed",
      });

      const body = res.json();
      expect(body.status).toBe("degraded");
      expect(body.turnCount).toBe(1);
    });

    it("returns unhealthy status after 5 consecutive errors", async () => {
      for (let i = 0; i < 5; i++) {
        metrics.handleTurnStart({ turnId: `t${i}`, sessionId: "s1" });
        metrics.handleTurnEnd({ turnId: `t${i}`, status: "errored" });
      }

      await createAndStart();

      const res = await server.instance.inject({
        method: "GET",
        url: "/api/health/detailed",
      });

      const body = res.json();
      expect(body.status).toBe("unhealthy");
    });

    it("includes cost totals from store", async () => {
      sessionStore.createSession({ sessionId: "s1", config: {} as any });
      costStore.addCostRecord({
        sessionId: "s1",
        turnId: "t1",
        promptTokens: 500,
        completionTokens: 200,
        timestamp: Date.now(),
      });

      await createAndStart();

      const res = await server.instance.inject({
        method: "GET",
        url: "/api/health/detailed",
      });

      const body = res.json();
      expect(body.costTotals.promptTokens).toBe(500);
      expect(body.costTotals.completionTokens).toBe(200);
    });
  });

  // ---- Original health endpoint still works ----

  describe("GET /health (original)", () => {
    it("returns basic health response", async () => {
      await createAndStart();

      const res = await server.instance.inject({
        method: "GET",
        url: "/health",
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.status).toBe("ok");
      expect(body.version).toBe("0.0.1");
      expect(typeof body.uptime).toBe("number");
    });
  });
});
