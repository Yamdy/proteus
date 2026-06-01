# PRD: Observability Dashboard — KPI Cards & Timeline Visualization

## Problem Statement

Proteus Studio has basic observability infrastructure (WebSocket phase events, REST traces/costs endpoints, a simple CostDashboard), but lacks the two most critical features for operational visibility:

1. **No aggregate metrics dashboard** — Users cannot see at-a-glance health indicators (total agent runs, token usage, error rates, latency percentiles) or compare current performance against previous periods. The existing `GET /api/metrics` endpoint returns mostly zeros.

2. **No trace timeline visualization** — Users cannot visualize the hierarchical structure of spans (chain → turn → phase) as a Gantt-style timeline. The existing traces view is a flat list of `StoreEvent` objects, not structured spans with parent-child relationships and timing bars.

These two features are the foundation of any production observability system — without them, users are flying blind on agent performance and debugging.

## Solution

Implement a Metrics Dashboard with KPI cards (period-over-period comparison) and a Trace Timeline with hierarchical span visualization, inspired by Mastra Studio's proven patterns but adapted to Proteus's event-bus architecture and domain model.

## User Stories

1. As an **operator**, I want to see 5 KPI cards at the top of the metrics page showing Total Agent Runs, Total Token Usage, Total Cost, Active Threads, and Error Rate, so that I can assess system health at a glance.

2. As an **operator**, I want each KPI card to show the current period value alongside the previous period value with a percentage change indicator (↑ green / ↓ red), so that I can detect performance regressions immediately.

3. As an **operator**, I want to select a date preset (24h, 3d, 7d, 14d, 30d) from a dropdown, so that I can quickly scope the dashboard to different time windows.

4. As an **operator**, I want to specify a custom date range (from/to) for the metrics dashboard, so that I can investigate incidents at specific times.

5. As an **operator**, I want to filter metrics by entity type (Agent, Workflow), entity name, session ID, and tags, so that I can drill down to specific components.

6. As an **operator**, I want my filter selections to persist in localStorage and be restored on page load, so that I don't have to re-configure filters every session.

7. As an **operator**, I want to see a Latency card showing p50 and p95 latency lines over time for agents, so that I can identify performance degradation trends.

8. As an **operator**, I want to see a Trace Volume card showing completed vs errored traces as horizontal stacked bars per entity, so that I can identify which agents are failing most.

9. As an **operator**, I want to see a Model Usage & Cost card showing a table of models with input tokens, output tokens, cache read/write, and estimated cost, so that I can manage LLM spending.

10. As an **operator**, I want to see a Token Usage by Agent card showing horizontal bars of token consumption per entity, so that I can identify token-hungry agents.

11. As an **operator**, I want to click on a KPI card or chart element and navigate to the Traces page with the relevant filters pre-applied, so that I can investigate anomalies directly.

12. As a **developer**, I want to view a list of all traces with columns for Date, Time, Name, Input preview, Entity, and Status, so that I can browse recent agent activity.

13. As a **developer**, I want the traces list to support infinite scroll with virtualized rendering, so that I can browse thousands of traces without performance degradation.

14. As a **developer**, I want the traces list to auto-poll for new traces every 5 seconds with delta highlighting (new rows pulse briefly), so that I can monitor live activity.

15. As a **developer**, I want to click a trace and see a hierarchical timeline visualization showing all spans as a Gantt chart with tree indentation, so that I can understand the execution flow.

16. As a **developer**, I want each span in the timeline to show a colored dot indicating its type (agent, model, tool, phase), so that I can quickly identify span categories.

17. As a **developer**, I want the timeline to show a horizontal bar for each span positioned relative to the trace root, with width proportional to span duration, so that I can see timing relationships.

18. As a **developer**, I want to hover over a span's timing bar and see a tooltip with latency, start time, end time, and start shift, so that I can get precise timing details.

19. As a **developer**, I want to expand and collapse span subtrees in the timeline, so that I can focus on specific parts of a trace.

20. As a **developer**, I want expand/collapse controls for: toggle current span's children, expand/collapse all descendants, and toggle siblings, so that I have fine-grained control over the view.

21. As a **developer**, I want to search within a trace timeline and have non-matching spans fade to 30% opacity while matching spans and their ancestors auto-expand, so that I can find specific spans quickly.

22. As a **developer**, I want to filter the timeline by span type (e.g., show only model spans) by clicking legend entries, so that I can focus on specific execution layers.

23. As a **developer**, I want to click a span and see a detail panel showing span ID, type, timing, input/output content, metadata, and attributes, so that I can inspect individual span data.

24. As a **developer**, I want the span detail panel to show token usage visualization (input/output split with breakdown by text, cache read, cache write), so that I can understand token consumption per span.

25. As a **developer**, I want to navigate between spans using prev/next buttons in the detail panel, so that I can walk through a trace sequentially.

26. As a **developer**, I want the span detail panel to auto-scroll the selected span into view in the timeline, so that I always see the context around the selected span.

27. As a **developer**, I want to see tree connector lines (L-shapes) in the span name column, so that I can visually trace parent-child relationships.

28. As a **developer**, I want finished traces to be cached aggressively (30 days) and only refetch if any span is still running, so that the UI is fast for historical traces.

29. As a **developer**, I want the metrics filters to use a stable "now" anchor (frozen when the window changes, not re-computed every render), so that queries don't cascade re-fetches.

30. As a **developer**, I want the React Query cache keys to combine the date window and dimensional filter digests into a single stable string, so that cache hits are precise and misses are minimal.

31. As an **operator**, I want to see a Health Status indicator (healthy/degraded/unhealthy) derived from consecutive errors, turn duration, and error status, so that I can assess system reliability.

32. As an **operator**, I want to see the 5-phase breakdown (context_assembly, llm_inference, action_resolution, tool_execution, result_observation) with per-phase latency and counts, so that I can identify which phase is the bottleneck.

33. As a **developer**, I want the Proteus span type mapping to recognize: `chain`, `turn`, `phase`, `model`, `tool`, `gate`, `processor`, and `other`, each with a distinct color and icon, so that I can visually distinguish Proteus-specific span types.

34. As a **developer**, I want the timeline to support a "branch mode" where I can view a subtree rooted at any span, so that I can focus on a specific turn or phase without distraction.

35. As an **operator**, I want the KPI cards to use `formatCompact` for large numbers (e.g., "1.2M" tokens, "3.4K" runs), so that the dashboard is readable at a glance.

36. As an **operator**, I want cost values formatted as "$0.02" for USD, so that costs are immediately understandable.

37. As a **developer**, I want the metrics page to use the MetricsProvider pattern where URL params are the single source of truth, derived into a MetricsContext, and consumed by hooks, so that state management is predictable and shareable via URLs.

38. As a **developer**, I want the traces page to use URL state for all selections (traceId, spanId, filters, date preset), so that I can share trace links with teammates.

## Implementation Decisions

### Module Architecture

The implementation will introduce a domain-based organization for observability in the studio package, following Mastra's proven pattern but adapted to Proteus's existing structure.

**New modules to build:**

1. **`ObservabilityMetricsProvider`** — React Context provider that owns URL-derived filter state (preset, custom range, dimensional filters) and exposes stable filter keys for React Query. This is the bridge between URL params and data-fetching hooks.

2. **`useMetricsFilters` hook** — Consumes the provider context, computes anchored timestamps, composes the final filter object, and produces a stable `filterKey` string. The "now" anchor is frozen via `useRef` keyed on `windowKey` to prevent query storms.

3. **`useKpiMetrics` family of hooks** — 5 hooks (AgentRuns, ModelCost, TotalTokens, ActiveThreads, ErrorRate) that call `getMetricAggregate` with `comparePeriod: 'previous_period'` and return React Query results. TotalTokens makes 2 parallel calls (input + output) and merges client-side.

4. **`KpiCard` compound component** — DS primitive with sub-components: Label, Value, Change, NoChange, NoData, Error, Loading. Uses `Object.assign` for composition. Change sub-component shows trend arrow + signed percentage + "vs previous".

5. **`MetricsServerAdapter`** — Server-side module that implements metric aggregation queries against the storage layer (SQLite/EventLog). Computes current + previous window aggregations and returns `{ value, previousValue, changePercent }`. This is where `comparePeriod` window-shifting logic lives.

6. **`formatHierarchicalSpans` utility** — Pure function that converts a flat array of span records into a nested `UISpan[]` tree. Algorithm: build lookup map → identify roots → link children → extend root endTime → recursive sort. Supports `anchorSpanId` for branch-subtree mode.

7. **`TraceTimeline` component** — Top-level grid container with legend bar. Renders root spans via recursive `TraceTimelineSpan`. CSS Grid with `grid-cols-[minmax(0,1fr)_auto_auto]` — each span renders 3 flat siblings (name, expand, timing) that the grid lays out as rows.

8. **`TraceTimelineSpan` recursive component** — Renders one span row with 3 columns. Children are conditionally rendered when expanded. Expand/collapse state lives in parent (`TraceDataPanelView`). Auto-expands ancestors when search matches descendants.

9. **`SpanTypeVisualMapping`** — Maps Proteus span types to colors and icons. Recognizes 8 prefixes: `chain` (blue), `turn` (purple), `phase` (cyan), `model` (teal), `tool` (orange), `gate` (pink), `processor` (indigo), `other` (gray). Type extraction: split on `_`, take first segment.

10. **`TimelineNameCol`** — Left column with tree connector lines (pure CSS pseudo-elements for L-shapes), indentation via `paddingLeft: depth * 1rem`, colored type dot, and truncated span name.

11. **`TimelineExpandCol`** — Middle column with conditional expand/collapse icon buttons: toggle children, expand/collapse all descendants, toggle siblings. Tooltip shows affected span count.

12. **`TimelineTimingCol`** — Right column with Gantt bar. Width = `span.latency / overallLatency * 100`, left offset = `(span.startTime - root.startTime) / overallLatency * 100`. HoverCard shows timing details.

13. **`SpanDetailPanel`** — Full panel with span ID, type, timing, token usage visualization (input/output split bar), key-value metadata, and code sections for Input/Output/Attributes. Tabbed interface for Details/Scoring.

14. **`SpanNavigation` hook** — Flattens hierarchical tree into depth-first ordered ID list, provides `handlePreviousSpan` and `handleNextSpan`. Parent auto-scrolls selected span into view.

15. **`useTraces` hook** — Infinite query with delta polling (5s default, 100ms chase when new data exists), page-0 status refresh every 60s, idle guard (15min hidden → reset), visual heartbeat (400ms minimum spinner), delta highlight (new rows pulse for 1s).

### Data Model Changes

**New types needed in core:**

- `SpanRecord` — Structured span with: `traceId`, `spanId`, `parentSpanId`, `name`, `type`, `startTime`, `endTime`, `status`, `input`, `output`, `metadata`, `attributes`, `tokenUsage`
- `MetricAggregateArgs` — `{ name: string[], aggregation: 'sum'|'avg'|'min'|'max'|'count'|'count_distinct', filters?, comparePeriod? }`
- `MetricAggregateResponse` — `{ value, previousValue, changePercent, estimatedCost?, previousEstimatedCost?, costChangePercent? }`
- `UISpan` — UI model: `{ id, name, type, latency, startTime, endTime?, spans?, parentSpanId? }`

**Storage layer changes:**

- Extend `EventLog` to support structured span queries (or introduce a `SpanStore` interface)
- Add `getMetricAggregate` method to the observability storage adapter
- Implement comparePeriod window-shifting logic: `previous_period` shifts by equal duration, `previous_day` shifts by 24h, `previous_week` shifts by 7d

### API Contract Changes

**New endpoints:**

- `POST /api/metrics/aggregate` — Accepts `MetricAggregateArgs`, returns `MetricAggregateResponse`. This is the primary KPI data source.
- `POST /api/metrics/percentiles` — Accepts `{ name, percentiles: [0.5, 0.95], interval: '1h', filters }`, returns time-series of percentile values.
- `POST /api/metrics/breakdown` — Accepts `{ name, groupBy, aggregation, filters, limit }`, returns grouped aggregation for charts.
- `GET /api/traces` — Enhanced to support pagination, filtering by entity type/name/status, and delta polling mode (`mode: 'delta', after: cursor`).
- `GET /api/traces/:traceId/spans` — Returns structured span tree for a trace (replaces raw event query).

**Modified endpoints:**

- `GET /api/metrics` — Enhanced to return actual aggregated data from MetricsCollector instead of zeros.

### Architectural Decisions

1. **URL is the single source of truth** for all filter/selection state. No component-level state for filters — everything round-trips through URL params. This enables shareable links and browser back/forward.

2. **React Query for all server state** with stable filter keys. Query keys are `['domain', 'metric-name', filterKey]` where `filterKey = JSON.stringify({ window, ...dimensionalFilter })`.

3. **Immutable caching for finished traces** — `staleTime: 30 days` for completed span data. Running traces always refetch.

4. **Flat DOM with CSS Grid** for timeline rendering — no nested tables or grids. The recursive component renders 3 flat siblings per span, and CSS Grid auto-generates rows.

5. **Compound components** for DS primitives (KpiCard, DataPanel) — composed via `Object.assign` for clean sub-component APIs.

6. **localStorage persistence** for filter state, keyed by domain (`mastra:metrics:saved-filters`, `mastra:traces:saved-filters`). Hydration only when URL is filter-clean.

7. **Span type mapping follows Proteus domain** — not generic OTel types. The 8 types (chain, turn, phase, model, tool, gate, processor, other) map to Proteus's execution model.

8. **MetricsCollector enhanced** to track phase-level and tool-level metrics, not just turn/chain counts. This feeds the KPI cards and chart cards.

### Schema Changes

- Add `SpanStore` interface to core: `addSpan(span: SpanRecord)`, `getTraceSpans(traceId: string): SpanRecord[]`, `listTraces(args: ListTracesArgs): PaginatedResponse<TraceSummary>`
- Add `getMetricAggregate` to observability storage adapter
- Extend `MetricsSnapshot` to include phaseBreakdown and toolCallStats (currently zeroed)

## Testing Decisions

### What makes a good test

- Test external behavior (API responses, rendered output), not implementation details (internal state, hook internals)
- Test the data pipeline end-to-end: URL params → filter composition → API call → rendered value
- Test edge cases: empty data, single span, deeply nested spans, missing parent spans (orphans), zero-duration spans
- Test period comparison: current > previous (green ↑), current < previous (red ↓), previous = 0 (no change)

### Modules to test

1. **`formatHierarchicalSpans`** — Pure function, highest test value. Test: flat → tree conversion, orphan handling, root endTime extension, anchorSpanId branch mode, recursive sorting.

2. **`MetricsServerAdapter.getMetricAggregate`** — Test: aggregation types (sum, count, count_distinct), comparePeriod window shifting, changePercent calculation, zero-division handling.

3. **`KpiCard` component** — Test: renders label/value/change correctly, shows error state, shows loading state, shows no-data state, handles null changePercent.

4. **`POST /api/metrics/aggregate` endpoint** — Test: valid request → correct response, invalid schema → 400, empty data → null value.

5. **`TraceTimeline` rendering** — Test: renders spans with correct indentation, expand/collapse works, search fading works, type filtering works.

6. **`useTraces` delta polling** — Test: initial fetch, delta cursor updates, idle guard reset, visual heartbeat timing.

### Prior art

- `packages/core/src/metrics-collector.test.ts` — Tests for MetricsCollector turn/chain tracking and health derivation
- `packages/server/src/routes/metrics.test.ts` — Tests for all 6 existing observability endpoints
- `packages/core/src/otel-bridge.test.ts` — Tests for span hierarchy and metric recording

## Out of Scope

1. **Logs viewer** — Dedicated log search/filter UI is deferred to a future PRD
2. **MCP integration** — Model Context Protocol server management is out of scope
3. **Scorer/Evaluation UI** — Evaluation and scoring dashboards are deferred
4. **Dataset/Experiment UI** — Dataset management and experiment comparison are deferred
5. **Real-time WebSocket metric streaming** — KPI cards use REST polling, not WebSocket push
6. **OTel exporter configuration UI** — OTel endpoint configuration remains env-var based
7. **Multi-tenant cost allocation** — Cost tracking is single-tenant for now
8. **Custom dashboard builder** — Users cannot create custom metric layouts

## Further Notes

### Proteus Domain Mapping

The Proteus execution model maps to observability concepts as follows:

| Proteus Concept | OTel Equivalent | Span Type Prefix |
|---|---|---|
| Chain (full agent invocation) | Trace | `chain` |
| Turn (one LLM loop iteration) | Span | `turn` |
| Phase (5-stage pipeline) | Child Span | `phase` |
| LLM API Call | Span | `model` |
| Tool Execution | Span | `tool` |
| Gate (middleware) | Span | `gate` |
| Processor (core logic) | Span | `processor` |

### Performance Considerations

- The timeline does NOT use virtualization — acceptable for typical traces (< 100 spans). Very large traces may need windowing in a future iteration.
- `getSpanDescendantIds` is O(n) per node → O(n²) total. For large traces, pre-compute descendant IDs during tree construction.
- KPI cards make 5-6 parallel API calls. Consider a single batch endpoint if latency becomes an issue.

### Migration Path

The existing `ObservabilityPage`, `PhaseTimeline`, `CostDashboard`, and `useObservability` hook remain functional. The new KPI dashboard and timeline visualization are additive features that can coexist with the current implementation. The `GET /api/metrics` endpoint will be enhanced to return real data from the enhanced MetricsCollector.
