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

  // ---- GET /metrics ----

  describe("GET /metrics", () => {
    it("returns 503 when MetricsCollector is not provided", async () => {
      server = new ProteusServer({ port: 0 });
      await server.start();

      const res = await server.instance.inject({
        method: "GET",
        url: "/metrics",
      });

      expect(res.statusCode).toBe(503);
      expect(res.json().error).toBe("MetricsCollector not available");
    });

    it("returns metrics snapshot with zeroed defaults", async () => {
      await createAndStart();

      const res = await server.instance.inject({
        method: "GET",
        url: "/metrics",
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.turnCount).toBe(0);
      expect(body.activeChains).toBe(0);
      expect(body.lastTurnDuration).toBe(0);
      expect(body.lastTurnStatus).toBeNull();
      expect(body.consecutiveErrors).toBe(0);
      expect(body.lastTurnTimestamp).toBeNull();
    });

    it("reflects populated metrics", async () => {
      metrics.handleTurnStart({ turnId: "t1", sessionId: "s1" });
      metrics.handleTurnEnd({ turnId: "t1", status: "completed" });
      metrics.handleChainStart({ chainId: "c1", sessionId: "s1" });

      await createAndStart();

      const res = await server.instance.inject({
        method: "GET",
        url: "/metrics",
      });

      const body = res.json();
      expect(body.turnCount).toBe(1);
      expect(body.activeChains).toBe(1);
      expect(body.lastTurnStatus).toBe("completed");
      expect(body.lastTurnTimestamp).toBeTypeOf("number");
    });
  });

  // ---- GET /costs ----

  describe("GET /costs", () => {
    it("returns 503 when CostStore is not provided", async () => {
      server = new ProteusServer({ port: 0 });
      await server.start();

      const res = await server.instance.inject({
        method: "GET",
        url: "/costs",
      });

      expect(res.statusCode).toBe(503);
    });

    it("returns empty records and summary when no data exists", async () => {
      await createAndStart();

      const res = await server.instance.inject({
        method: "GET",
        url: "/costs",
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.records).toEqual([]);
      expect(body.summary.totalRecords).toBe(0);
      expect(body.summary.totalPromptTokens).toBe(0);
      expect(body.summary.totalCompletionTokens).toBe(0);
      expect(body.summary.sessionCount).toBe(0);
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
        url: "/costs",
      });

      const body = res.json();
      expect(body.records).toHaveLength(2);
      expect(body.summary.totalRecords).toBe(2);
      expect(body.summary.totalPromptTokens).toBe(300);
      expect(body.summary.totalCompletionTokens).toBe(130);
      expect(body.summary.sessionCount).toBe(2);
    });
  });

  // ---- GET /costs/:sessionId ----

  describe("GET /costs/:sessionId", () => {
    it("returns 503 when CostStore is not provided", async () => {
      server = new ProteusServer({ port: 0 });
      await server.start();

      const res = await server.instance.inject({
        method: "GET",
        url: "/costs/s1",
      });

      expect(res.statusCode).toBe(503);
    });

    it("returns empty records for unknown session", async () => {
      await createAndStart();

      const res = await server.instance.inject({
        method: "GET",
        url: "/costs/unknown",
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.sessionId).toBe("unknown");
      expect(body.records).toEqual([]);
      expect(body.summary.totalRecords).toBe(0);
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
        url: "/costs/s1",
      });

      const body = res.json();
      expect(body.sessionId).toBe("s1");
      expect(body.records).toHaveLength(2);
      expect(body.summary.totalRecords).toBe(2);
      expect(body.summary.totalPromptTokens).toBe(300);
      expect(body.summary.totalCompletionTokens).toBe(130);
    });
  });

  // ---- GET /traces/:sessionId ----

  describe("GET /traces/:sessionId", () => {
    it("returns 503 when EventLog is not provided", async () => {
      server = new ProteusServer({ port: 0 });
      await server.start();

      const res = await server.instance.inject({
        method: "GET",
        url: "/traces/s1",
      });

      expect(res.statusCode).toBe(503);
    });

    it("returns empty events for unknown session", async () => {
      await createAndStart();

      const res = await server.instance.inject({
        method: "GET",
        url: "/traces/unknown",
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
        url: "/traces/s1",
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
        url: "/traces/s1?since=3000",
      });

      const body = res.json();
      expect(body.events).toHaveLength(1);
      expect(body.events[0].event).toBe("new");
    });
  });

  // ---- GET /health/detailed ----

  describe("GET /health/detailed", () => {
    it("returns 503 when MetricsCollector is not provided", async () => {
      server = new ProteusServer({ port: 0 });
      await server.start();

      const res = await server.instance.inject({
        method: "GET",
        url: "/health/detailed",
      });

      expect(res.statusCode).toBe(503);
    });

    it("returns detailed health with defaults", async () => {
      await createAndStart({ handlerCount: 3 });

      const res = await server.instance.inject({
        method: "GET",
        url: "/health/detailed",
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
        url: "/health/detailed",
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
        url: "/health/detailed",
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
        url: "/health/detailed",
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
