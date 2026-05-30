// @proteus/server — Status and config API routes

import type { FastifyInstance } from "fastify";
import type { MetricsCollector, MetricsSnapshot, LifecycleStateMachine, ConfigSnapshotManager } from "@proteus/core";

export interface StatusRouteDeps {
  metrics?: MetricsCollector;
  lifecycle?: LifecycleStateMachine;
  configManager?: ConfigSnapshotManager;
  /** Default session ID used when none is provided in the request. */
  sessionId?: string;
}

const DEFAULT_METRICS: MetricsSnapshot = {
  turnCount: 0,
  activeChains: 0,
  lastTurnDuration: 0,
  lastTurnStatus: null,
  consecutiveErrors: 0,
  lastTurnTimestamp: null,
};

export async function registerStatusRoutes(
  app: FastifyInstance,
  deps: StatusRouteDeps = {},
): Promise<void> {
  // Keep track of server start time for uptime calculation
  const startTime = Date.now();

  // --- In-memory config store (used when no ConfigSnapshotManager is provided) ---
  let currentConfig: Record<string, unknown> = {};

  // GET /status
  app.get("/status", async () => {
    const lifecycleState = deps.lifecycle?.state ?? "pending";
    const uptimeMs = Date.now() - startTime;
    const metrics = deps.metrics?.getMetrics() ?? DEFAULT_METRICS;

    return {
      lifecycle: lifecycleState,
      uptime: uptimeMs,
      metrics,
    };
  });

  // GET /config
  app.get("/config", async () => {
    if (deps.configManager && deps.sessionId) {
      const snapshots = deps.configManager.listSnapshots(deps.sessionId);
      if (snapshots.length > 0) {
        const latest = snapshots[snapshots.length - 1];
        return {
          sessionId: latest.sessionId,
          handlers: latest.handlers,
          timestamp: latest.timestamp,
          description: latest.description,
          checksum: latest.checksum,
        };
      }
    }

    return { config: currentConfig };
  });

  // POST /config
  app.post("/config", async (request) => {
    const body = (request.body ?? {}) as Record<string, unknown>;

    // Merge partial config into the in-memory store
    currentConfig = { ...currentConfig, ...body };

    return {
      ok: true,
      config: currentConfig,
    };
  });
}
