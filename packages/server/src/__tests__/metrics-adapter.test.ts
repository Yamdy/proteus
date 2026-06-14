// @proteus/server — MetricsServerAdapter tests
// TDD RED phase: tests written before implementation.

import { describe, it, expect, beforeEach } from "vitest";
import type { EventLog, CostStore, MetricsCollector } from "@proteus/core";
import type { StoreEvent } from "@proteus/core";

// ---------------------------------------------------------------------------
// Helpers: In-memory EventLog for adapter tests
// ---------------------------------------------------------------------------

function createTestEventLog(): EventLog & { _events: StoreEvent[] } {
  const events: StoreEvent[] = [];
  return {
    _events: events,
    appendEvent(event: StoreEvent) {
      events.push(event);
    },
    queryEvents(sessionId: string, since?: number) {
      return events.filter(
        (e) =>
          e.sessionId === sessionId &&
          (since === undefined || e.timestamp >= since),
      );
    },
    queryAllEvents(start?: number, end?: number) {
      return events.filter(
        (e) =>
          (start === undefined || e.timestamp >= start) &&
          (end === undefined || e.timestamp < end),
      );
    },
  };
}

function createTestCostStore(): CostStore {
  return {
    addCostRecord() {},
    loadCostRecords() {
      return [];
    },
  };
}

function createTestMetricsCollector(): MetricsCollector {
  return {
    handleTurnStart() {},
    handleTurnEnd() {},
    handleChainStart() {},
    handleChainEnd() {},
    getMetrics() {
      return {
        turnCount: 0,
        activeChains: 0,
        lastTurnDuration: 0,
        lastTurnStatus: null,
        consecutiveErrors: 0,
        lastTurnTimestamp: null,
      };
    },
  } as unknown as MetricsCollector;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("MetricsServerAdapter", () => {
  let eventLog: ReturnType<typeof createTestEventLog>;
  let costStore: CostStore;
  let metrics: MetricsCollector;

  beforeEach(() => {
    eventLog = createTestEventLog();
    costStore = createTestCostStore();
    metrics = createTestMetricsCollector();
  });

  // Dynamically import the adapter inside tests so it can be tested even if
  // the module doesn't exist yet (RED phase).
  async function createAdapter() {
    const { MetricsServerAdapter } = await import("../metrics-adapter.js");
    return new MetricsServerAdapter({ eventLog, costStore, metrics });
  }

  // Helper: seed events with known timestamps and metric values
  function seedEvents() {
    const base = 1000;
    // Events at t=1000, t=2000, t=3000 with payload.value
    for (let i = 1; i <= 3; i++) {
      eventLog.appendEvent({
        sessionId: "s1",
        event: "latency",
        payload: { value: i * 10 },
        timestamp: base + i,
      });
    }
    // Events at t=4000, t=5000 — different session, same event
    for (let i = 4; i <= 5; i++) {
      eventLog.appendEvent({
        sessionId: "s2",
        event: "latency",
        payload: { value: i * 10 },
        timestamp: base + i,
      });
    }
    // Event at t=6000 — different event name
    eventLog.appendEvent({
      sessionId: "s1",
      event: "errors",
      payload: { value: 1 },
      timestamp: base + 6,
    });
  }

  // --- getMetricAggregate: sum aggregation ---

  describe("getMetricAggregate with sum aggregation", () => {
    it("sums payload.value for matching events in window", async () => {
      seedEvents();
      const adapter = await createAdapter();

      const result = await adapter.getMetricAggregate({
        name: ["latency"],
        aggregation: "sum",
        timestamp: { start: 1000, end: 2000 },
      });

      // Window [1000, 2000): events at t=1001..t=1005
      // latency events at t=1001 (10), t=1002 (20), t=1003 (30), t=1004 (40), t=1005 (50)
      expect(result.value).toBe(150);
    });
  });

  // --- getMetricAggregate: count aggregation ---

  describe("getMetricAggregate with count aggregation", () => {
    it("counts matching events in window", async () => {
      seedEvents();
      const adapter = await createAdapter();

      const result = await adapter.getMetricAggregate({
        name: ["latency"],
        aggregation: "count",
        timestamp: { start: 1000, end: 2000 },
      });

      expect(result.value).toBe(5);
    });
  });

  // --- getMetricAggregate: count_distinct aggregation ---

  describe("getMetricAggregate with count_distinct aggregation", () => {
    it("counts distinct values of distinctColumn", async () => {
      // Add events with distinct sessionIds
      eventLog.appendEvent({
        sessionId: "a",
        event: "turn",
        payload: {},
        timestamp: 1001,
      });
      eventLog.appendEvent({
        sessionId: "b",
        event: "turn",
        payload: {},
        timestamp: 1002,
      });
      eventLog.appendEvent({
        sessionId: "a",
        event: "turn",
        payload: {},
        timestamp: 1003,
      });

      const adapter = await createAdapter();

      const result = await adapter.getMetricAggregate({
        name: [""],
        aggregation: "count_distinct",
        distinctColumn: "sessionId",
        timestamp: { start: 1000, end: 2000 },
      });

      expect(result.value).toBe(2); // distinct sessionIds: "a", "b"
    });
  });

  // --- getMetricAggregate: avg, min, max ---

  describe("getMetricAggregate with avg/min/max aggregation", () => {
    it("computes avg of payload.value", async () => {
      seedEvents();
      const adapter = await createAdapter();

      const result = await adapter.getMetricAggregate({
        name: ["latency"],
        aggregation: "avg",
        timestamp: { start: 1000, end: 2000 },
      });

      // values: 10, 20, 30, 40, 50 → avg = 30
      expect(result.value).toBe(30);
    });

    it("computes min of payload.value", async () => {
      seedEvents();
      const adapter = await createAdapter();

      const result = await adapter.getMetricAggregate({
        name: ["latency"],
        aggregation: "min",
        timestamp: { start: 1000, end: 2000 },
      });

      expect(result.value).toBe(10);
    });

    it("computes max of payload.value", async () => {
      seedEvents();
      const adapter = await createAdapter();

      const result = await adapter.getMetricAggregate({
        name: ["latency"],
        aggregation: "max",
        timestamp: { start: 1000, end: 2000 },
      });

      expect(result.value).toBe(50);
    });
  });

  // --- getMetricAggregate: comparePeriod previous_period ---

  describe("getMetricAggregate with comparePeriod", () => {
    it("computes changePercent for previous_period", async () => {
      // Current window [1000, 2000): values 10, 20, 30, 40, 50 → sum 150
      // Previous window [0, 1000): values 100, 200 → sum 300
      eventLog.appendEvent({
        sessionId: "s1",
        event: "latency",
        payload: { value: 100 },
        timestamp: 500,
      });
      eventLog.appendEvent({
        sessionId: "s1",
        event: "latency",
        payload: { value: 200 },
        timestamp: 600,
      });
      seedEvents();

      const adapter = await createAdapter();

      const result = await adapter.getMetricAggregate({
        name: ["latency"],
        aggregation: "sum",
        timestamp: { start: 1000, end: 2000 },
        comparePeriod: "previous_period",
      });

      // current = 150, previous = 300
      // changePercent = ((150 - 300) / |300|) * 100 = -50
      expect(result.value).toBe(150);
      expect(result.previousValue).toBe(300);
      expect(result.changePercent).toBe(-50);
    });

    it("computes changePercent for previous_day", async () => {
      const DAY = 86_400_000;
      const now = 1_000_000;

      // Current window [now, now+1000)
      eventLog.appendEvent({
        sessionId: "s1",
        event: "cost",
        payload: { value: 200 },
        timestamp: now + 100,
      });

      // Previous day window [now - DAY, now - DAY + 1000)
      eventLog.appendEvent({
        sessionId: "s1",
        event: "cost",
        payload: { value: 100 },
        timestamp: now - DAY + 100,
      });

      const adapter = await createAdapter();

      const result = await adapter.getMetricAggregate({
        name: [""],
        aggregation: "sum",
        timestamp: { start: now, end: now + 1000 },
        comparePeriod: "previous_day",
      });

      expect(result.value).toBe(200);
      expect(result.previousValue).toBe(100);
      expect(result.changePercent).toBe(100);
    });

    it("computes changePercent for previous_week", async () => {
      const WEEK = 7 * 86_400_000;
      const now = 1_000_000;

      eventLog.appendEvent({
        sessionId: "s1",
        event: "cost",
        payload: { value: 300 },
        timestamp: now + 100,
      });

      eventLog.appendEvent({
        sessionId: "s1",
        event: "cost",
        payload: { value: 150 },
        timestamp: now - WEEK + 100,
      });

      const adapter = await createAdapter();

      const result = await adapter.getMetricAggregate({
        name: [""],
        aggregation: "sum",
        timestamp: { start: now, end: now + 1000 },
        comparePeriod: "previous_week",
      });

      expect(result.value).toBe(300);
      expect(result.previousValue).toBe(150);
      expect(result.changePercent).toBe(100);
    });
  });

  // --- changePercent zero-division ---

  describe("changePercent zero-division handling", () => {
    it("returns 100 when previous is 0 and current > 0", async () => {
      // Current window has value, previous has none
      eventLog.appendEvent({
        sessionId: "s1",
        event: "latency",
        payload: { value: 50 },
        timestamp: 1500,
      });

      const adapter = await createAdapter();

      const result = await adapter.getMetricAggregate({
        name: [""],
        aggregation: "sum",
        timestamp: { start: 1000, end: 2000 },
        comparePeriod: "previous_period",
      });

      expect(result.value).toBe(50);
      expect(result.previousValue).toBe(0);
      expect(result.changePercent).toBe(100);
    });

    it("returns 0 when both current and previous are 0", async () => {
      const adapter = await createAdapter();

      const result = await adapter.getMetricAggregate({
        name: [""],
        aggregation: "sum",
        timestamp: { start: 1000, end: 2000 },
        comparePeriod: "previous_period",
      });

      expect(result.value).toBe(0);
      expect(result.previousValue).toBe(0);
      expect(result.changePercent).toBe(0);
    });
  });

  // --- Filters applied to both windows ---

  describe("MetricsDimensionalFilter", () => {
    it("filters events by metadata attributes in both windows", async () => {
      // Current window: 2 events, 1 matching filter
      eventLog.appendEvent({
        sessionId: "s1",
        event: "latency",
        payload: { value: 100, status: "ok" },
        timestamp: 1500,
      });
      eventLog.appendEvent({
        sessionId: "s1",
        event: "latency",
        payload: { value: 200, status: "error" },
        timestamp: 1600,
      });

      // Previous window: 2 events, 1 matching filter
      eventLog.appendEvent({
        sessionId: "s1",
        event: "latency",
        payload: { value: 50, status: "ok" },
        timestamp: 500,
      });
      eventLog.appendEvent({
        sessionId: "s1",
        event: "latency",
        payload: { value: 75, status: "error" },
        timestamp: 600,
      });

      const adapter = await createAdapter();

      const result = await adapter.getMetricAggregate({
        name: [""],
        aggregation: "sum",
        timestamp: { start: 1000, end: 2000 },
        comparePeriod: "previous_period",
        filters: { status: "ok" },
      });

      expect(result.value).toBe(100);
      expect(result.previousValue).toBe(50);
      expect(result.changePercent).toBe(100);
    });
  });

  // --- Empty data ---

  describe("empty data", () => {
    it("returns null value when no events match", async () => {
      const adapter = await createAdapter();

      const result = await adapter.getMetricAggregate({
        name: [""],
        aggregation: "sum",
        timestamp: { start: 1000, end: 2000 },
      });

      expect(result.value).toBeNull();
    });

    it("returns null value for count with no matching events", async () => {
      const adapter = await createAdapter();

      const result = await adapter.getMetricAggregate({
        name: [""],
        aggregation: "count",
        timestamp: { start: 1000, end: 2000 },
      });

      expect(result.value).toBeNull();
    });
  });
});
