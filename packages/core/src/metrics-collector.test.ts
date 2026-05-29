import { describe, it, expect, vi, beforeEach } from "vitest";
import { MetricsCollector, registerMetricsCollector, deriveHealthStatus, buildHealthResponse, type HealthMetricsInput } from "./metrics-collector.js";
import { HandlerEngine } from "./handler-engine.js";

describe("MetricsCollector", () => {
  let collector: MetricsCollector;

  beforeEach(() => {
    collector = new MetricsCollector();
  });

  describe("initial state", () => {
    it("returns zero counters on creation", () => {
      const m = collector.getMetrics();
      expect(m.turnCount).toBe(0);
      expect(m.activeChains).toBe(0);
      expect(m.lastTurnDuration).toBe(0);
      expect(m.lastTurnStatus).toBeNull();
      expect(m.consecutiveErrors).toBe(0);
      expect(m.lastTurnTimestamp).toBeNull();
    });
  });

  describe("turn events", () => {
    it("increments turnCount on turn:end", () => {
      collector.handleTurnStart({ turnId: "t1", sessionId: "s1" });
      collector.handleTurnEnd({ turnId: "t1", status: "completed" });
      expect(collector.getMetrics().turnCount).toBe(1);
    });

    it("tracks lastTurnDuration from turn:start to turn:end", () => {
      vi.useFakeTimers();
      collector.handleTurnStart({ turnId: "t1", sessionId: "s1" });
      vi.advanceTimersByTime(500);
      collector.handleTurnEnd({ turnId: "t1", status: "completed" });
      const m = collector.getMetrics();
      expect(m.lastTurnDuration).toBeGreaterThanOrEqual(500);
      expect(m.lastTurnTimestamp).toBeTypeOf("number");
      vi.useRealTimers();
    });

    it("records lastTurnStatus from turn:end payload", () => {
      collector.handleTurnStart({ turnId: "t1", sessionId: "s1" });
      collector.handleTurnEnd({ turnId: "t1", status: "errored" });
      expect(collector.getMetrics().lastTurnStatus).toBe("errored");
    });

    it("resets consecutiveErrors to 0 on completed turn", () => {
      collector.handleTurnStart({ turnId: "t1", sessionId: "s1" });
      collector.handleTurnEnd({ turnId: "t1", status: "errored" });
      collector.handleTurnStart({ turnId: "t2", sessionId: "s1" });
      collector.handleTurnEnd({ turnId: "t2", status: "errored" });
      expect(collector.getMetrics().consecutiveErrors).toBe(2);

      collector.handleTurnStart({ turnId: "t3", sessionId: "s1" });
      collector.handleTurnEnd({ turnId: "t3", status: "completed" });
      expect(collector.getMetrics().consecutiveErrors).toBe(0);
    });

    it("increments consecutiveErrors on errored turn", () => {
      collector.handleTurnStart({ turnId: "t1", sessionId: "s1" });
      collector.handleTurnEnd({ turnId: "t1", status: "errored" });
      expect(collector.getMetrics().consecutiveErrors).toBe(1);
    });

    it("does not increment consecutiveErrors on aborted turn", () => {
      collector.handleTurnStart({ turnId: "t1", sessionId: "s1" });
      collector.handleTurnEnd({ turnId: "t1", status: "aborted" });
      expect(collector.getMetrics().consecutiveErrors).toBe(0);
    });
  });

  describe("chain events", () => {
    it("increments activeChains on chain:start", () => {
      collector.handleChainStart({ chainId: "c1", sessionId: "s1" });
      expect(collector.getMetrics().activeChains).toBe(1);
    });

    it("decrements activeChains on chain:end", () => {
      collector.handleChainStart({ chainId: "c1", sessionId: "s1" });
      collector.handleChainStart({ chainId: "c2", sessionId: "s1" });
      collector.handleChainEnd({ chainId: "c1", sessionId: "s1", status: "completed", turns: 3 });
      expect(collector.getMetrics().activeChains).toBe(1);
    });

    it("does not go below zero on chain:end without start", () => {
      collector.handleChainEnd({ chainId: "c1", sessionId: "s1", status: "completed", turns: 1 });
      expect(collector.getMetrics().activeChains).toBe(0);
    });
  });
});

describe("registerMetricsCollector", () => {
  it("registers 4 observers on engine", () => {
    const engine = new HandlerEngine();
    const collector = registerMetricsCollector(engine);
    const serialized = engine.serialize().handlers.filter(h => h.name.startsWith("metrics-collector"));
    expect(serialized).toHaveLength(4);
    expect(collector).toBeInstanceOf(MetricsCollector);
  });

  it("collector receives events through engine.emit", async () => {
    const engine = new HandlerEngine();
    const collector = registerMetricsCollector(engine);

    await engine.emit("chain:start", { chainId: "c1", sessionId: "s1" });
    await engine.emit("turn:start", { turnId: "t1", sessionId: "s1" });
    await engine.emit("turn:end", { turnId: "t1", status: "completed" });
    await engine.emit("chain:end", { chainId: "c1", sessionId: "s1", status: "completed", turns: 1 });

    const m = collector.getMetrics();
    expect(m.turnCount).toBe(1);
    expect(m.activeChains).toBe(0);
    expect(m.lastTurnStatus).toBe("completed");
  });
});

describe("deriveHealthStatus", () => {
  function baseInput(overrides?: Partial<HealthMetricsInput>): HealthMetricsInput {
    return {
      activeChains: 0,
      turnCount: 0,
      lastTurnDuration: 0,
      lastTurnStatus: null,
      consecutiveErrors: 0,
      lastTurnTimestamp: null,
      uptime: 1000,
      ...overrides,
    };
  }

  it("returns healthy when no errors and recent activity", () => {
    expect(deriveHealthStatus(baseInput({ turnCount: 5, lastTurnTimestamp: Date.now() }))).toBe("healthy");
  });

  it("returns healthy with zero turns (just started)", () => {
    expect(deriveHealthStatus(baseInput())).toBe("healthy");
  });

  it("returns degraded when consecutiveErrors >= 1 but < 5", () => {
    expect(deriveHealthStatus(baseInput({ consecutiveErrors: 3 }))).toBe("degraded");
  });

  it("returns unhealthy when consecutiveErrors >= 5", () => {
    expect(deriveHealthStatus(baseInput({ consecutiveErrors: 5 }))).toBe("unhealthy");
  });

  it("returns degraded when lastTurnDuration exceeds 120s", () => {
    expect(deriveHealthStatus(baseInput({ lastTurnDuration: 121_000 }))).toBe("degraded");
  });

  it("returns degraded when lastTurnStatus is errored", () => {
    expect(deriveHealthStatus(baseInput({ lastTurnStatus: "errored" }))).toBe("degraded");
  });

  it("prioritizes unhealthy over degraded when both conditions met", () => {
    expect(deriveHealthStatus(baseInput({
      consecutiveErrors: 10,
      lastTurnDuration: 200_000,
      lastTurnStatus: "errored",
    }))).toBe("unhealthy");
  });
});

describe("buildHealthResponse", () => {
  it("returns all required fields", () => {
    const now = Date.now();
    const response = buildHealthResponse({
      metrics: {
        turnCount: 1,
        activeChains: 0,
        lastTurnDuration: 100,
        lastTurnStatus: "completed",
        consecutiveErrors: 0,
        lastTurnTimestamp: now,
      },
      costTotals: { promptTokens: 50, completionTokens: 30 },
      handlerCount: 4,
      sessionId: "s1",
      uptime: 5000,
    });
    expect(response.status).toBe("healthy");
    expect(response.uptime).toBe(5000);
    expect(response.activeChains).toBe(0);
    expect(response.turnCount).toBe(1);
    expect(response.lastTurnDuration).toBe(100);
    expect(response.costTotals).toEqual({ promptTokens: 50, completionTokens: 30 });
    expect(response.handlerCount).toBe(4);
    expect(response.sessionId).toBe("s1");
    expect(response.timestamp).toBeTypeOf("number");
  });

  it("derives unhealthy status from errored metrics", () => {
    const response = buildHealthResponse({
      metrics: {
        turnCount: 10,
        activeChains: 1,
        lastTurnDuration: 500,
        lastTurnStatus: "errored",
        consecutiveErrors: 6,
        lastTurnTimestamp: Date.now(),
      },
      costTotals: { promptTokens: 0, completionTokens: 0 },
      handlerCount: 2,
      sessionId: "s1",
      uptime: 60000,
    });
    expect(response.status).toBe("unhealthy");
  });
});
