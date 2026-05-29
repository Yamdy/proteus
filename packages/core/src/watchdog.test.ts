import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Watchdog, type WatchdogConfig, type HealthFetchResult } from "./watchdog.js";

function healthyResponse(overrides?: Partial<HealthFetchResult>): HealthFetchResult {
  return {
    status: "healthy",
    uptime: 10000,
    activeChains: 0,
    turnCount: 5,
    lastTurnDuration: 200,
    lastTurnStatus: "completed",
    consecutiveErrors: 0,
    lastTurnTimestamp: Date.now(),
    ...overrides,
  };
}

function mockFetch(response: HealthFetchResult) {
  return vi.fn(async () => response);
}

function mockExecFile() {
  return vi.fn(async () => ({ stdout: "", stderr: "" }));
}

function baseConfig(overrides?: Partial<WatchdogConfig>): WatchdogConfig {
  return {
    port: 3210,
    interval: 1000,
    thresholds: {
      maxConsecutiveErrors: 5,
      maxTurnDurationMs: 120_000,
      maxInactiveMs: 300_000,
    },
    ...overrides,
  };
}

describe("Watchdog", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("lifecycle", () => {
    it("starts and stops without error", () => {
      const fetch = mockFetch(healthyResponse());
      const execFile = mockExecFile();
      const wd = new Watchdog(baseConfig({ httpFetch: fetch, execFile }));
      wd.start();
      expect(wd.isRunning()).toBe(true);
      wd.stop();
      expect(wd.isRunning()).toBe(false);
    });

    it("does not poll before first interval", () => {
      const fetch = mockFetch(healthyResponse());
      const wd = new Watchdog(baseConfig({ httpFetch: fetch }));
      wd.start();
      expect(fetch).not.toHaveBeenCalled();
      wd.stop();
    });

    it("polls after interval elapses", async () => {
      const fetch = mockFetch(healthyResponse());
      const wd = new Watchdog(baseConfig({ httpFetch: fetch, interval: 5000 }));
      wd.start();
      await vi.advanceTimersByTimeAsync(5000);
      expect(fetch).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(5000);
      expect(fetch).toHaveBeenCalledTimes(2);
      wd.stop();
    });
  });

  describe("anomaly detection", () => {
    it("does not trigger on healthy response", async () => {
      const fetch = mockFetch(healthyResponse());
      const execFile = mockExecFile();
      const onAnomaly = vi.fn();
      const wd = new Watchdog(baseConfig({ httpFetch: fetch, execFile, onAnomaly }));
      wd.start();
      await vi.advanceTimersByTimeAsync(1000);
      expect(onAnomaly).not.toHaveBeenCalled();
      expect(execFile).not.toHaveBeenCalled();
      wd.stop();
    });

    it("triggers on consecutiveErrors >= threshold", async () => {
      const fetch = mockFetch(healthyResponse({ consecutiveErrors: 5 }));
      const execFile = mockExecFile();
      const onAnomaly = vi.fn();
      const wd = new Watchdog(baseConfig({ httpFetch: fetch, execFile, onAnomaly }));
      wd.start();
      await vi.advanceTimersByTimeAsync(1000);
      expect(onAnomaly).toHaveBeenCalledOnce();
      expect(onAnomaly).toHaveBeenCalledWith(expect.objectContaining({
        reason: "consecutive_errors",
        metrics: expect.objectContaining({ consecutiveErrors: 5 }),
      }));
      wd.stop();
    });

    it("triggers on lastTurnDuration > threshold", async () => {
      const fetch = mockFetch(healthyResponse({ lastTurnDuration: 150_000 }));
      const execFile = mockExecFile();
      const onAnomaly = vi.fn();
      const wd = new Watchdog(baseConfig({ httpFetch: fetch, execFile, onAnomaly }));
      wd.start();
      await vi.advanceTimersByTimeAsync(1000);
      expect(onAnomaly).toHaveBeenCalledOnce();
      expect(onAnomaly).toHaveBeenCalledWith(expect.objectContaining({
        reason: "turn_duration",
      }));
      wd.stop();
    });

    it("triggers on inactive too long (no recent turn)", async () => {
      const fetch = mockFetch(healthyResponse({
        lastTurnTimestamp: Date.now() - 400_000,
        turnCount: 3,
      }));
      const execFile = mockExecFile();
      const onAnomaly = vi.fn();
      const wd = new Watchdog(baseConfig({ httpFetch: fetch, execFile, onAnomaly }));
      wd.start();
      await vi.advanceTimersByTimeAsync(1000);
      expect(onAnomaly).toHaveBeenCalledOnce();
      expect(onAnomaly).toHaveBeenCalledWith(expect.objectContaining({
        reason: "inactive",
      }));
      wd.stop();
    });

    it("does not trigger inactive when no turns yet (lastTurnTimestamp null)", async () => {
      const fetch = mockFetch(healthyResponse({
        lastTurnTimestamp: null,
        turnCount: 0,
      }));
      const execFile = mockExecFile();
      const onAnomaly = vi.fn();
      const wd = new Watchdog(baseConfig({ httpFetch: fetch, execFile, onAnomaly }));
      wd.start();
      await vi.advanceTimersByTimeAsync(1000);
      expect(onAnomaly).not.toHaveBeenCalled();
      wd.stop();
    });
  });

  describe("git revert", () => {
    it("calls git revert HEAD --no-edit on anomaly", async () => {
      const fetch = mockFetch(healthyResponse({ consecutiveErrors: 6 }));
      const execFile = mockExecFile();
      const wd = new Watchdog(baseConfig({ httpFetch: fetch, execFile }));
      wd.start();
      await vi.advanceTimersByTimeAsync(1000);
      expect(execFile).toHaveBeenCalledWith("git", ["revert", "HEAD", "--no-edit"]);
      wd.stop();
    });

    it("does not call git revert in dryRun mode", async () => {
      const fetch = mockFetch(healthyResponse({ consecutiveErrors: 6 }));
      const execFile = mockExecFile();
      const wd = new Watchdog(baseConfig({ httpFetch: fetch, execFile, dryRun: true }));
      wd.start();
      await vi.advanceTimersByTimeAsync(1000);
      expect(execFile).not.toHaveBeenCalled();
      wd.stop();
    });

    it("calls onAnomaly even in dryRun mode", async () => {
      const fetch = mockFetch(healthyResponse({ consecutiveErrors: 6 }));
      const execFile = mockExecFile();
      const onAnomaly = vi.fn();
      const wd = new Watchdog(baseConfig({ httpFetch: fetch, execFile, dryRun: true, onAnomaly }));
      wd.start();
      await vi.advanceTimersByTimeAsync(1000);
      expect(onAnomaly).toHaveBeenCalledOnce();
      wd.stop();
    });
  });

  describe("fetch error handling", () => {
    it("treats fetch failure as anomaly", async () => {
      const fetch = vi.fn(async () => { throw new Error("connection refused"); });
      const execFile = mockExecFile();
      const onAnomaly = vi.fn();
      const wd = new Watchdog(baseConfig({ httpFetch: fetch, execFile, onAnomaly }));
      wd.start();
      await vi.advanceTimersByTimeAsync(1000);
      expect(onAnomaly).toHaveBeenCalledWith(expect.objectContaining({
        reason: "fetch_error",
      }));
      wd.stop();
    });

    it("does not crash on fetch error", async () => {
      const fetch = vi.fn(async () => { throw new Error("ECONNREFUSED"); });
      const execFile = mockExecFile();
      const wd = new Watchdog(baseConfig({ httpFetch: fetch, execFile }));
      wd.start();
      await vi.advanceTimersByTimeAsync(1000);
      expect(wd.isRunning()).toBe(true);
      wd.stop();
    });
  });

  describe("state machine", () => {
    it("transitions healthy → warning on first anomaly", async () => {
      const fetch = mockFetch(healthyResponse({ consecutiveErrors: 3 }));
      const wd = new Watchdog(baseConfig({ httpFetch: fetch, thresholds: { maxConsecutiveErrors: 3, maxTurnDurationMs: 120_000, maxInactiveMs: 300_000 } }));
      wd.start();
      await vi.advanceTimersByTimeAsync(1000);
      expect(wd.getState()).toBe("warning");
      wd.stop();
    });

    it("transitions to critical on fetch error", async () => {
      const fetch = vi.fn(async () => { throw new Error("ECONNREFUSED"); });
      const wd = new Watchdog(baseConfig({ httpFetch: fetch }));
      wd.start();
      await vi.advanceTimersByTimeAsync(1000);
      expect(wd.getState()).toBe("critical");
      wd.stop();
    });

    it("transitions back to healthy after normal poll", async () => {
      let response: HealthFetchResult = healthyResponse({ consecutiveErrors: 3 });
      const fetch = vi.fn(async () => response);
      const wd = new Watchdog(baseConfig({ httpFetch: fetch, thresholds: { maxConsecutiveErrors: 3, maxTurnDurationMs: 120_000, maxInactiveMs: 300_000 } }));
      wd.start();
      await vi.advanceTimersByTimeAsync(1000);
      expect(wd.getState()).toBe("warning");

      response = healthyResponse();
      await vi.advanceTimersByTimeAsync(1000);
      expect(wd.getState()).toBe("healthy");
      wd.stop();
    });
  });
});
