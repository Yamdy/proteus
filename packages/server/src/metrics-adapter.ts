// @proteus/server — MetricsServerAdapter
// Aggregates events from EventLog with dimensional filters and period comparisons.

import type { EventLog, CostStore, MetricsCollector, StoreEvent, MetricAggregateArgs, MetricAggregateResponse, MetricsDimensionalFilter } from "@proteus/core";

// Re-export types for consumers
export type { MetricAggregateArgs, MetricAggregateResponse, MetricsDimensionalFilter };

type Aggregation = "sum" | "count" | "count_distinct" | "avg" | "min" | "max";
type ComparePeriod = "previous_period" | "previous_day" | "previous_week";

export interface PercentileArgs {
  metric: string;
  window: { start: number; end: number };
  percentiles?: number[];
  filters?: MetricsDimensionalFilter;
}

export interface PercentileResponse {
  percentiles: Record<string, number>;
}

export interface BreakdownArgs {
  metric: string;
  window: { start: number; end: number };
  groupBy: string;
  aggregation?: Aggregation;
  filters?: MetricsDimensionalFilter;
}

export interface BreakdownResponse {
  groups: Array<{ key: string; value: number }>;
}

// --- Internal helpers ---

function matchesFilters(
  event: StoreEvent,
  filters?: MetricsDimensionalFilter,
): boolean {
  if (!filters) return true;
  const payload = event.payload as Record<string, unknown> | undefined;
  const eventRecord = event as unknown as Record<string, unknown>;

  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null) continue;

    // Check payload first, then event top-level fields
    const fieldValue = payload?.[key] ?? eventRecord[key];

    if (Array.isArray(value)) {
      // Tags filter: check if any tag matches
      if (!value.includes(String(fieldValue))) return false;
    } else {
      if (String(fieldValue) !== String(value)) return false;
    }
  }
  return true;
}

function getMetricValue(event: StoreEvent): number | null {
  const payload = event.payload as Record<string, unknown> | undefined;
  if (!payload) return 1;
  if (typeof payload.value === "number") return payload.value;
  if (typeof payload.amount === "number") return payload.amount;
  return 1;
}

function getDistinctValue(event: StoreEvent, column: string): string | null {
  // Check top-level event fields first
  if (column === "sessionId") return event.sessionId;
  if (column === "event") return event.event;
  // Then check payload
  const payload = event.payload as Record<string, unknown> | undefined;
  if (payload && payload[column] !== undefined) return String(payload[column]);
  return null;
}

function aggregateValues(
  events: StoreEvent[],
  aggregation: Aggregation,
  distinctColumn?: string,
): number | null {
  if (events.length === 0) return null;

  switch (aggregation) {
    case "sum": {
      let total = 0;
      for (const e of events) {
        const v = getMetricValue(e);
        if (v !== null) total += v;
      }
      return total;
    }
    case "count":
      return events.length;
    case "count_distinct": {
      if (!distinctColumn) return events.length;
      const seen = new Set<string>();
      for (const e of events) {
        const v = getDistinctValue(e, distinctColumn);
        if (v !== null) seen.add(v);
      }
      return seen.size;
    }
    case "avg": {
      let total = 0;
      let count = 0;
      for (const e of events) {
        const v = getMetricValue(e);
        if (v !== null) {
          total += v;
          count++;
        }
      }
      return count > 0 ? total / count : null;
    }
    case "min": {
      let min = Infinity;
      for (const e of events) {
        const v = getMetricValue(e);
        if (v !== null && v < min) min = v;
      }
      return min === Infinity ? null : min;
    }
    case "max": {
      let max = -Infinity;
      for (const e of events) {
        const v = getMetricValue(e);
        if (v !== null && v > max) max = v;
      }
      return max === -Infinity ? null : max;
    }
    default:
      return null;
  }
}

function computeChangePercent(
  current: number | null,
  previous: number | null,
): number | undefined {
  if (current === null && previous === null) return undefined;
  const c = current ?? 0;
  const p = previous ?? 0;
  if (p === 0 && c > 0) return 100;
  if (p === 0 && c === 0) return 0;
  return ((c - p) / Math.abs(p)) * 100;
}

function shiftWindow(
  window: { start: number; end: number },
  comparePeriod: ComparePeriod,
): { start: number; end: number } {
  const duration = window.end - window.start;
  switch (comparePeriod) {
    case "previous_period":
      return { start: window.start - duration, end: window.end - duration };
    case "previous_day":
      return {
        start: window.start - 86_400_000,
        end: window.end - 86_400_000,
      };
    case "previous_week":
      return {
        start: window.start - 7 * 86_400_000,
        end: window.end - 7 * 86_400_000,
      };
  }
}

// --- Adapter ---

export interface MetricsServerAdapterOptions {
  eventLog: EventLog;
  costStore?: CostStore;
  metrics?: MetricsCollector;
}

export class MetricsServerAdapter {
  private readonly eventLog: EventLog;

  constructor(opts: MetricsServerAdapterOptions) {
    this.eventLog = opts.eventLog;
  }

  async getMetricAggregate(
    args: MetricAggregateArgs,
  ): Promise<MetricAggregateResponse> {
    const { name, aggregation, timestamp, comparePeriod, filters, distinctColumn } = args;
    const metric = name[0]; // Use first metric name

    // Compute time window
    const now = Date.now();
    const window = timestamp ?? { start: now - 86_400_000, end: now };

    // Query events in current window
    const allEvents = this.eventLog.queryAllEvents(window.start, window.end);
    const currentEvents = allEvents.filter(
      (e) => e.event === metric && matchesFilters(e, filters),
    );
    const currentValue = aggregateValues(currentEvents, aggregation as Aggregation, distinctColumn);

    let previousValue: number | null | undefined;
    let changePercent: number | undefined;

    // When comparing periods, coerce null values to 0 for meaningful comparison
    const effectiveValue = comparePeriod ? (currentValue ?? 0) : currentValue;
    let effectivePrevious: number | null | undefined;

    if (comparePeriod) {
      const prevWindow = shiftWindow(window, comparePeriod as ComparePeriod);
      const prevAllEvents = this.eventLog.queryAllEvents(prevWindow.start, prevWindow.end);
      const prevEvents = prevAllEvents.filter(
        (e) => e.event === metric && matchesFilters(e, filters),
      );
      previousValue = aggregateValues(prevEvents, aggregation as Aggregation, distinctColumn);
      effectivePrevious = previousValue ?? 0;
      changePercent = computeChangePercent(effectiveValue, effectivePrevious);
    }

    const isCostMetric =
      metric.includes("cost") || metric.includes("estimatedCost");

    return {
      value: effectiveValue,
      ...(comparePeriod && { previousValue: previousValue ?? 0 }),
      ...(changePercent !== undefined && { changePercent }),
      ...(isCostMetric && {
        estimatedCost: effectiveValue,
        previousEstimatedCost: previousValue ?? 0,
        costChangePercent: changePercent,
      }),
    };
  }

  async getMetricPercentiles(
    _args: PercentileArgs,
  ): Promise<PercentileResponse> {
    // Stub: not part of issue #147 scope
    return { percentiles: {} };
  }

  async getMetricBreakdown(
    _args: BreakdownArgs,
  ): Promise<BreakdownResponse> {
    // Stub: not part of issue #147 scope
    return { groups: [] };
  }
}
