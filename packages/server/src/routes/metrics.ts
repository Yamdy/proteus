// @proteus/server — Metrics / Costs / Traces / Health routes

import type { FastifyInstance } from "fastify";
import type {
  MetricsCollector,
  CostStore,
  EventLog,
  SessionStore,
  SpanStore,
} from "@proteus/core";
import { buildHealthResponse } from "@proteus/core";

export interface MetricsRoutesOptions {
  metrics?: MetricsCollector;
  costStore?: CostStore;
  eventLog?: EventLog;
  sessionStore?: SessionStore;
  spanStore?: SpanStore;
  handlerCount?: number;
}

export async function registerMetricsRoutes(
  app: FastifyInstance,
  opts: MetricsRoutesOptions,
): Promise<void> {
  const { metrics, costStore, eventLog, sessionStore, spanStore, handlerCount } = opts;

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

  // GET /traces/:traceId/spans — spans for a specific trace
  // Returns SpanRecord[] for the given traceId
  app.get<{ Params: { traceId: string } }>(
    "/traces/:traceId/spans",
    async (request) => {
      const { traceId } = request.params;

      // Prefer SpanStore when available
      if (spanStore) {
        return spanStore.getTraceSpans(traceId);
      }

      // Fallback: derive span-like records from EventLog
      if (!eventLog) {
        return [];
      }

      const allEvents = eventLog.queryAllEvents();
      const events = allEvents.filter((e) => e.sessionId === traceId);
      return events.map((e, i) => ({
        traceId,
        spanId: `${traceId}-span-${i}`,
        name: e.event,
        type: e.event,
        startTime: e.timestamp,
        status: e.event === "error" ? "error" : "success",
        attributes: e.payload ?? undefined,
      }));
    },
  );

  // POST /metrics/aggregate — metric aggregation endpoint
  app.post<{ Body: Record<string, unknown> }>(
    "/metrics/aggregate",
    async (request, reply) => {
      try {
        const { MetricAggregateArgsSchema } = await import("@proteus/core");
        const args = MetricAggregateArgsSchema.parse(request.body);

        // Import MetricsServerAdapter dynamically
        const { MetricsServerAdapter } = await import("../metrics-adapter.js");
        const adapter = new MetricsServerAdapter({
          eventLog: eventLog!,
          costStore,
          metrics,
        });

        return adapter.getMetricAggregate(args);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Invalid request";
        return reply.code(400).send({ error: msg });
      }
    },
  );

  // GET /traces — enhanced traces with pagination and filtering
  app.get<{
    Querystring: {
      page?: string;
      limit?: string;
      status?: string;
      rootEntityType?: string;
      entityName?: string;
      mode?: string;
      since?: string;
    };
  }>("/traces", async (request) => {
    const page = Math.max(1, Number(request.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(request.query.limit) || 25));
    const { status, rootEntityType, entityName, mode, since } = request.query;

    // If SpanStore is available, use it
    // Otherwise, derive from EventLog
    const sinceTs = since ? Number(since) : undefined;

    // Get all events and group by traceId
    const allEvents = eventLog ? eventLog.queryAllEvents(sinceTs) : [];

    // Group events by traceId to create trace summaries
    const traceMap = new Map<string, { startTime: number; endTime?: number; events: typeof allEvents }>();
    for (const event of allEvents) {
      const traceId = event.sessionId || "unknown";
      const existing = traceMap.get(traceId) ?? { startTime: event.timestamp, events: [] };
      existing.events.push(event);
      if (event.timestamp < existing.startTime) existing.startTime = event.timestamp;
      if (!existing.endTime || event.timestamp > existing.endTime) existing.endTime = event.timestamp;
      traceMap.set(traceId, existing);
    }

    // Convert to trace summaries
    let traces = Array.from(traceMap.entries()).map(([traceId, data]) => ({
      traceId,
      name: data.events[0]?.event || "unknown",
      type: data.events[0]?.event || "unknown",
      status: (data.events.some(e => e.event === "error") ? "error" : "success") as "running" | "success" | "error",
      startTime: data.startTime,
      endTime: data.endTime,
      latency: data.endTime ? data.endTime - data.startTime : undefined,
      entityName: (data.events[0]?.payload as Record<string, unknown>)?.entityName as string | undefined,
      rootEntityType: data.events[0]?.event,
    }));

    // Apply filters
    if (status) {
      traces = traces.filter((t) => t.status === status);
    }
    if (rootEntityType) {
      traces = traces.filter((t) => t.rootEntityType === rootEntityType);
    }
    if (entityName) {
      traces = traces.filter((t) => t.entityName === entityName);
    }

    // Delta mode
    if (mode === "delta" && sinceTs) {
      traces = traces.filter((t) => t.startTime > sinceTs);
    }

    // Sort by startTime descending (newest first)
    traces.sort((a, b) => b.startTime - a.startTime);

    // Paginate
    const total = traces.length;
    const start = (page - 1) * limit;
    const data = traces.slice(start, start + limit);
    const hasMore = start + limit < total;

    return { data, total, page, limit, hasMore };
  });

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
