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

  // GET /metrics — live metrics snapshot
  app.get("/metrics", async (_request, reply) => {
    if (!metrics) {
      return reply.code(503).send({ error: "MetricsCollector not available" });
    }
    return metrics.getMetrics();
  });

  // GET /costs — all cost records
  app.get("/costs", async (_request, reply) => {
    if (!costStore) {
      return reply.code(503).send({ error: "CostStore not available" });
    }

    const sessions = sessionStore?.listSessions() ?? [];
    const records = sessions.flatMap((s) =>
      costStore.loadCostRecords(s.sessionId),
    );

    const sessionIds = new Set(records.map((r) => r.sessionId));

    return {
      records,
      summary: {
        totalRecords: records.length,
        totalPromptTokens: records.reduce((sum, r) => sum + r.promptTokens, 0),
        totalCompletionTokens: records.reduce((sum, r) => sum + r.completionTokens, 0),
        sessionCount: sessionIds.size,
      },
    };
  });

  // GET /costs/:sessionId — cost records for one session
  app.get<{ Params: { sessionId: string } }>(
    "/costs/:sessionId",
    async (request, reply) => {
      if (!costStore) {
        return reply.code(503).send({ error: "CostStore not available" });
      }

      const { sessionId } = request.params;
      const records = costStore.loadCostRecords(sessionId);

      return {
        sessionId,
        records,
        summary: {
          totalRecords: records.length,
          totalPromptTokens: records.reduce((sum, r) => sum + r.promptTokens, 0),
          totalCompletionTokens: records.reduce((sum, r) => sum + r.completionTokens, 0),
        },
      };
    },
  );

  // GET /traces/:sessionId — event traces for one session
  app.get<{
    Params: { sessionId: string };
    Querystring: { since?: string };
  }>("/traces/:sessionId", async (request, reply) => {
    if (!eventLog) {
      return reply.code(503).send({ error: "EventLog not available" });
    }

    const { sessionId } = request.params;
    const since = request.query.since
      ? Number(request.query.since)
      : undefined;
    const events = eventLog.queryEvents(sessionId, since);

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
