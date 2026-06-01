// @proteus/core — In-memory SpanStore implementation

import type {
  SpanStore,
  SpanRecord,
  TraceSummary,
  ListTracesArgs,
  PaginatedResponse,
} from "./span-store.js";

export class InMemorySpanStore implements SpanStore {
  private spans = new Map<string, SpanRecord>();
  private byTrace = new Map<string, string[]>();

  addSpan(span: SpanRecord): void {
    this.spans.set(span.spanId, span);
    const existing = this.byTrace.get(span.traceId) ?? [];
    if (!existing.includes(span.spanId)) {
      existing.push(span.spanId);
      this.byTrace.set(span.traceId, existing);
    }
  }

  getTraceSpans(traceId: string): SpanRecord[] {
    const spanIds = this.byTrace.get(traceId) ?? [];
    return spanIds.map((id) => this.spans.get(id)!);
  }

  listTraces(args: ListTracesArgs): PaginatedResponse<TraceSummary> {
    const page = args.page ?? 1;
    const limit = args.limit ?? 25;

    // Build summaries for all traces
    const allSummaries: TraceSummary[] = [];
    for (const traceId of this.byTrace.keys()) {
      const summary = this.buildTraceSummary(traceId);
      if (!summary) continue;
      allSummaries.push(summary);
    }

    // Sort by startTime descending (newest first)
    allSummaries.sort((a, b) => b.startTime - a.startTime);

    // Apply delta mode filter
    let filtered = allSummaries;
    if (args.mode === "delta" && args.since !== undefined) {
      filtered = filtered.filter((s) => s.startTime > args.since!);
    }

    // Apply filters
    if (args.status) {
      filtered = filtered.filter((s) => s.status === args.status);
    }
    if (args.rootEntityType) {
      filtered = filtered.filter((s) => s.rootEntityType === args.rootEntityType);
    }
    if (args.entityName) {
      filtered = filtered.filter((s) => s.entityName === args.entityName);
    }

    const total = filtered.length;
    const start = (page - 1) * limit;
    const data = filtered.slice(start, start + limit);
    const hasMore = start + limit < total;

    return { data, total, page, limit, hasMore };
  }

  getTraceSummary(traceId: string): TraceSummary | null {
    if (!this.byTrace.has(traceId)) return null;
    return this.buildTraceSummary(traceId);
  }

  private buildTraceSummary(traceId: string): TraceSummary | null {
    const spans = this.getTraceSpans(traceId);
    if (spans.length === 0) return null;

    // Root span = no parentSpanId
    const root = spans.find((s) => !s.parentSpanId) ?? spans[0];

    return {
      traceId,
      name: root.name,
      type: root.type,
      status: root.status,
      startTime: root.startTime,
      endTime: root.endTime,
      latency: root.endTime !== undefined ? root.endTime - root.startTime : undefined,
      entityName: root.name,
      rootEntityType: root.type,
    };
  }
}
