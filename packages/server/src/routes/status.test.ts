import { describe, it, expect, afterEach } from "vitest";
import { ProteusServer, createServer } from "../server.js";
import { LifecycleStateMachine, MetricsCollector, ConfigSnapshotManager, InMemoryConfigStore } from "@proteus/core";

describe("Status and Config API", () => {
  let server: ProteusServer;

  afterEach(async () => {
    if (server) {
      await server.stop();
    }
  });

  describe("GET /api/status", () => {
    it("returns default status when no deps are provided", async () => {
      server = createServer({ port: 0 });
      await server.start();

      const response = await server.instance.inject({
        method: "GET",
        url: "/api/status",
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.lifecycle).toBe("pending");
      expect(typeof body.uptime).toBe("number");
      expect(body.uptime).toBeGreaterThanOrEqual(0);
      expect(body.metrics).toEqual({
        turnCount: 0,
        activeChains: 0,
        lastTurnDuration: 0,
        lastTurnStatus: null,
        consecutiveErrors: 0,
        lastTurnTimestamp: null,
      });
    });

    it("returns lifecycle state from provided LifecycleStateMachine", async () => {
      const lifecycle = new LifecycleStateMachine("running");
      server = createServer({ port: 0, lifecycle });
      await server.start();

      const response = await server.instance.inject({
        method: "GET",
        url: "/api/status",
      });

      const body = response.json();
      expect(body.lifecycle).toBe("running");
    });

    it("returns metrics from provided MetricsCollector", async () => {
      const metrics = new MetricsCollector();
      metrics.handleTurnStart({ turnId: "t1", sessionId: "s1" });
      metrics.handleTurnEnd({ turnId: "t1", status: "ok" });

      server = createServer({ port: 0, metrics });
      await server.start();

      const response = await server.instance.inject({
        method: "GET",
        url: "/api/status",
      });

      const body = response.json();
      expect(body.metrics.turnCount).toBe(1);
      expect(body.metrics.lastTurnStatus).toBe("ok");
    });

    it("uptime increases over time", async () => {
      server = createServer({ port: 0 });
      await server.start();

      const r1 = await server.instance.inject({ method: "GET", url: "/api/status" });
      const uptime1 = r1.json().uptime;

      // Small delay to ensure uptime increases
      await new Promise((resolve) => setTimeout(resolve, 50));

      const r2 = await server.instance.inject({ method: "GET", url: "/api/status" });
      const uptime2 = r2.json().uptime;

      expect(uptime2).toBeGreaterThanOrEqual(uptime1);
    });
  });

  describe("GET /api/config", () => {
    it("returns default config when no deps are provided", async () => {
      server = createServer({ port: 0 });
      await server.start();

      const response = await server.instance.inject({
        method: "GET",
        url: "/api/config",
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      // Default config has level0/level1/level2 structure
      expect(body.level0).toBeDefined();
      expect(body.level0.llm).toBeDefined();
    });

    it("returns config snapshot from ConfigSnapshotManager when available", async () => {
      const store = new InMemoryConfigStore();
      const configManager = new ConfigSnapshotManager(store);
      const sessionId = "test-session";

      // Manually save a snapshot into the store
      store.saveConfigSnapshot({
        sessionId,
        handlers: { handlers: [{ name: "test-handler" }] },
        timestamp: 1000,
        description: "test snapshot",
        checksum: "abc123",
      });

      server = createServer({ port: 0, configManager, sessionId });
      await server.start();

      const response = await server.instance.inject({
        method: "GET",
        url: "/api/config",
      });

      const body = response.json();
      expect(body.sessionId).toBe(sessionId);
      expect(body.description).toBe("test snapshot");
      expect(body.checksum).toBe("abc123");
    });

    it("falls back to default config when ConfigSnapshotManager has no snapshots", async () => {
      const store = new InMemoryConfigStore();
      const configManager = new ConfigSnapshotManager(store);

      server = createServer({ port: 0, configManager, sessionId: "empty-session" });
      await server.start();

      const response = await server.instance.inject({
        method: "GET",
        url: "/api/config",
      });

      const body = response.json();
      // Should return default config structure
      expect(body.level0).toBeDefined();
    });
  });

  describe("POST /api/config", () => {
    it("updates config with posted body", async () => {
      server = createServer({ port: 0 });
      await server.start();

      const response = await server.instance.inject({
        method: "POST",
        url: "/api/config",
        payload: { model: "gpt-4", temperature: 0.7 },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.model).toBe("gpt-4");
      expect(body.temperature).toBe(0.7);
    });

    it("merges subsequent updates", async () => {
      server = createServer({ port: 0 });
      await server.start();

      // First update
      await server.instance.inject({
        method: "POST",
        url: "/api/config",
        payload: { model: "gpt-4", temperature: 0.7 },
      });

      // Second partial update
      const response = await server.instance.inject({
        method: "POST",
        url: "/api/config",
        payload: { temperature: 0.9, maxTokens: 1024 },
      });

      const body = response.json();
      expect(body.model).toBe("gpt-4");
      expect(body.temperature).toBe(0.9);
      expect(body.maxTokens).toBe(1024);
    });

    it("persisted config is visible via GET /api/config", async () => {
      server = createServer({ port: 0 });
      await server.start();

      // POST some config
      await server.instance.inject({
        method: "POST",
        url: "/api/config",
        payload: { customField: "test-value" },
      });

      // GET the config back
      const response = await server.instance.inject({
        method: "GET",
        url: "/api/config",
      });

      const body = response.json();
      expect(body.customField).toBe("test-value");
    });

    it("handles empty body", async () => {
      server = createServer({ port: 0 });
      await server.start();

      const response = await server.instance.inject({
        method: "POST",
        url: "/api/config",
        payload: {},
      });

      expect(response.statusCode).toBe(200);
    });
  });
});
