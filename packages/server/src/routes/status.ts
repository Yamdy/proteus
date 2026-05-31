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

  // --- In-memory AgentConfig store (matches Studio frontend AgentConfig shape) ---
  let currentConfig: Record<string, unknown> = {
    level0: {
      llm: { provider: "deepseek", model: "deepseek-v4-pro", temperature: 0.7 },
      tools: [],
      logLevel: "info",
    },
    level1: {
      handlers: [
        { id: "context-assembly", name: "Context Assembly", priority: 100, enabled: true, description: "Assembles context from working memory" },
        { id: "llm-inference", name: "LLM Inference", priority: 200, enabled: true, description: "Runs LLM inference" },
        { id: "action-resolution", name: "Action Resolution", priority: 300, enabled: true, description: "Resolves tool calls and actions" },
        { id: "tool-execution", name: "Tool Execution", priority: 400, enabled: true, description: "Executes tool calls" },
        { id: "result-observation", name: "Result Observation", priority: 500, enabled: true, description: "Observes and stores results" },
      ],
    },
    level2: {
      code: "",
      language: "typescript",
    },
  };

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

  // GET /config — returns AgentConfig directly (frontend expects level0/level1/level2 at top level)
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

    return currentConfig;
  });

  // POST /config — accepts full AgentConfig, stores and returns it
  app.post("/config", async (request) => {
    const body = (request.body ?? {}) as Record<string, unknown>;

    // Replace config entirely with the posted AgentConfig
    currentConfig = { ...currentConfig, ...body };

    return currentConfig;
  });
}
