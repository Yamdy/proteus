// @proteus/server — Metrics / Costs / Traces / Health routes

import type { FastifyInstance } from "fastify";
import type {
  MetricsCollector,
  CostStore,
  EventLog,
  SessionStore,
} from "@proteus/core";
import { buildHealthResponse } from "@proteus/core";

export interface MetricsRoutesOptions {
  metrics?: MetricsCollector;
  costStore?: CostStore;
  eventLog?: EventLog;
  sessionStore?: SessionStore;
  handlerCount?: number;
}

export async function registerMetricsRoutes(
  app: FastifyInstance,
  opts: MetricsRoutesOptions,
): Promise<void> {
  const { metrics, costStore, eventLog, sessionStore, handlerCount } = opts;

  // GET /metrics — live metrics snapshot (format matching frontend MetricsSnapshot)
  app.get("/metrics", async () => {
    const snapshot = metrics?.getMetrics();
    const defaultPhases = {
      context_assembly: { count: 0, avgDurationMs: 0 },
      llm_inference: { count: 0, avgDurationMs: 0 },
      action_resolution: { count: 0, avgDurationMs: 0 },
      tool_execution: { count: 0, avgDurationMs: 0 },
      result_observation: { count: 0, avgDurationMs: 0 },
    };
    return {
      totalTraces: snapshot?.turnCount ?? 0,
      totalSpans: 0,
      averageLatencyMs: snapshot?.lastTurnDuration ?? 0,
      errorRate: snapshot?.consecutiveErrors ?? 0,
      phaseBreakdown: defaultPhases,
      toolCallStats: [],
    };
  });

  // GET /costs — all cost records (format matching frontend CostSummary)
  app.get("/costs", async () => {
    // CostRecord core type: { sessionId, turnId, promptTokens, completionTokens, timestamp }
    // Frontend CostEntry expects: { id, sessionId, turnId, timestamp, model, promptTokens, completionTokens, totalTokens, costUsd }
    type RawCostRecord = {
      sessionId: string;
      turnId: string;
      promptTokens: number;
      completionTokens: number;
      timestamp: number;
    };

    let rawRecords: RawCostRecord[] = [];

    if (costStore && sessionStore) {
      const sessions = sessionStore.listSessions();
      rawRecords = sessions.flatMap((s) =>
        costStore.loadCostRecords(s.sessionId),
      );
    }

    // Map to frontend CostEntry shape
    const records = rawRecords.map((r) => ({
      id: `${r.sessionId}-${r.turnId}-${r.timestamp}`,
      sessionId: r.sessionId,
      turnId: r.turnId,
      timestamp: r.timestamp,
      model: "unknown",
      promptTokens: r.promptTokens,
      completionTokens: r.completionTokens,
      totalTokens: r.promptTokens + r.completionTokens,
      costUsd: 0,
    }));

    // Group by session
    const sessionMap = new Map<string, { costUsd: number; tokens: number }>();
    const modelMap = new Map<string, { costUsd: number; tokens: number }>();

    for (const r of records) {
      const sEntry = sessionMap.get(r.sessionId) ?? { costUsd: 0, tokens: 0 };
      sEntry.costUsd += r.costUsd;
      sEntry.tokens += r.totalTokens;
      sessionMap.set(r.sessionId, sEntry);

      const mEntry = modelMap.get(r.model) ?? { costUsd: 0, tokens: 0 };
      mEntry.costUsd += r.costUsd;
      mEntry.tokens += r.totalTokens;
      modelMap.set(r.model, mEntry);
    }

    return {
      totalCostUsd: records.reduce((sum, r) => sum + r.costUsd, 0),
      totalTokens: records.reduce((sum, r) => sum + r.totalTokens, 0),
      bySession: Array.from(sessionMap.entries()).map(([sessionId, v]) => ({
        sessionId,
        costUsd: v.costUsd,
        tokens: v.tokens,
      })),
      byModel: Array.from(modelMap.entries()).map(([model, v]) => ({
        model,
        costUsd: v.costUsd,
        tokens: v.tokens,
      })),
      byTurn: records,
    };
  });

  // GET /costs/:sessionId — cost records for one session (format matching frontend CostSummary)
  app.get<{ Params: { sessionId: string } }>(
    "/costs/:sessionId",
    async (request) => {
      const { sessionId } = request.params;
      const rawRecords = costStore
        ? costStore.loadCostRecords(sessionId)
        : [];

      const records = rawRecords.map((r) => ({
        id: `${r.sessionId}-${r.turnId}-${r.timestamp}`,
        sessionId: r.sessionId,
        turnId: r.turnId,
        timestamp: r.timestamp,
        model: "unknown",
        promptTokens: r.promptTokens,
        completionTokens: r.completionTokens,
        totalTokens: r.promptTokens + r.completionTokens,
        costUsd: 0,
      }));

      // Group by session
      const sessionMap = new Map<string, { costUsd: number; tokens: number }>();
      const modelMap = new Map<string, { costUsd: number; tokens: number }>();

      for (const r of records) {
        const sEntry = sessionMap.get(r.sessionId) ?? { costUsd: 0, tokens: 0 };
        sEntry.costUsd += r.costUsd;
        sEntry.tokens += r.totalTokens;
        sessionMap.set(r.sessionId, sEntry);

        const mEntry = modelMap.get(r.model) ?? { costUsd: 0, tokens: 0 };
        mEntry.costUsd += r.costUsd;
        mEntry.tokens += r.totalTokens;
        modelMap.set(r.model, mEntry);
      }

      return {
        totalCostUsd: records.reduce((sum, r) => sum + r.costUsd, 0),
        totalTokens: records.reduce((sum, r) => sum + r.totalTokens, 0),
        bySession: Array.from(sessionMap.entries()).map(([sid, v]) => ({
          sessionId: sid,
          costUsd: v.costUsd,
          tokens: v.tokens,
        })),
        byModel: Array.from(modelMap.entries()).map(([model, v]) => ({
          model,
          costUsd: v.costUsd,
          tokens: v.tokens,
        })),
        byTurn: records,
      };
    },
  );

  // GET /traces/:sessionId — event traces for one session
  // Returns { sessionId, events, count } — frontend normalizes via payload.events ?? payload
  app.get<{
    Params: { sessionId: string };
    Querystring: { since?: string };
  }>("/traces/:sessionId", async (request) => {
    const { sessionId } = request.params;
    const since = request.query.since
      ? Number(request.query.since)
      : undefined;
    const events = eventLog
      ? eventLog.queryEvents(sessionId, since)
      : [];

    return {
      sessionId,
      events,
      count: events.length,
    };
  });

  // GET /traces/:traceId/tool-calls — tool calls for a trace
  // Frontend expects ToolCallMetric[] — return empty array when not available
  app.get<{ Params: { traceId: string } }>(
    "/traces/:traceId/tool-calls",
    async (_request) => {
      // Tool call data is not yet persisted in the store — return empty
      return [];
    },
  );

  // GET /health/detailed — detailed health using buildHealthResponse
  app.get("/health/detailed", async (_request, reply) => {
    if (!metrics) {
      return reply.code(503).send({ error: "MetricsCollector not available" });
    }

    const metricsSnapshot = metrics.getMetrics();

    let costTotals = { promptTokens: 0, completionTokens: 0 };
    if (costStore && sessionStore) {
      const sessions = sessionStore.listSessions();
      const records = sessions.flatMap((s) =>
        costStore.loadCostRecords(s.sessionId),
      );
      costTotals = {
        promptTokens: records.reduce((sum, r) => sum + r.promptTokens, 0),
        completionTokens: records.reduce(
          (sum, r) => sum + r.completionTokens,
          0,
        ),
      };
    }

    return buildHealthResponse({
      metrics: metricsSnapshot,
      costTotals,
      handlerCount: handlerCount ?? 0,
      sessionId: "server",
      uptime: process.uptime(),
    });
  });
}
