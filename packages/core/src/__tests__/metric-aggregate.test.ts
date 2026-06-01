import { describe, it, expect } from "vitest";
import {
  MetricAggregateArgsSchema,
  MetricAggregateResponseSchema,
  MetricsDimensionalFilterSchema,
  comparePeriodSchema,
  type MetricAggregateResponse,
} from "../metric-aggregate.js";

// --- comparePeriodSchema ---

describe("comparePeriodSchema", () => {
  it("validates 'previous_period'", () => {
    expect(comparePeriodSchema.parse("previous_period")).toBe("previous_period");
  });

  it("validates 'previous_day'", () => {
    expect(comparePeriodSchema.parse("previous_day")).toBe("previous_day");
  });

  it("validates 'previous_week'", () => {
    expect(comparePeriodSchema.parse("previous_week")).toBe("previous_week");
  });

  it("rejects invalid value", () => {
    expect(() => comparePeriodSchema.parse("previous_month")).toThrow();
    expect(() => comparePeriodSchema.parse("")).toThrow();
    expect(() => comparePeriodSchema.parse(42)).toThrow();
  });
});

// --- MetricsDimensionalFilterSchema ---

describe("MetricsDimensionalFilterSchema", () => {
  it("accepts empty object", () => {
    const result = MetricsDimensionalFilterSchema.parse({});
    expect(result).toEqual({});
  });

  it("accepts partial filters with string values", () => {
    const result = MetricsDimensionalFilterSchema.parse({
      entityType: "agent",
      status: "success",
      model: "gpt-4",
    });
    expect(result.entityType).toBe("agent");
    expect(result.status).toBe("success");
    expect(result.model).toBe("gpt-4");
  });

  it("accepts tags as string array", () => {
    const result = MetricsDimensionalFilterSchema.parse({
      tags: ["prod", "critical"],
    });
    expect(result.tags).toEqual(["prod", "critical"]);
  });

  it("accepts all 16 filterable dimensions", () => {
    const full = {
      entityType: "agent",
      entityName: "my-agent",
      entityId: "e1",
      sessionId: "s1",
      threadId: "t1",
      status: "success",
      tags: ["a"],
      model: "gpt-4",
      provider: "openai",
      parentEntityType: "workflow",
      parentEntityName: "wf1",
      toolName: "search",
      phaseName: "tool_execution",
      handlerName: "ToolExecutionProcessor",
      agentId: "ag1",
      workflowId: "w1",
    };
    const result = MetricsDimensionalFilterSchema.parse(full);
    expect(result).toEqual(full);
  });

  it("rejects non-string value for a dimension", () => {
    expect(() =>
      MetricsDimensionalFilterSchema.parse({ entityType: 123 }),
    ).toThrow();
  });

  it("rejects non-array tags", () => {
    expect(() =>
      MetricsDimensionalFilterSchema.parse({ tags: "not-array" }),
    ).toThrow();
  });
});

// --- MetricAggregateArgsSchema ---

describe("MetricAggregateArgsSchema", () => {
  it("validates minimal args with single name", () => {
    const result = MetricAggregateArgsSchema.parse({
      name: ["agent_duration_ms"],
      aggregation: "avg",
    });
    expect(result.name).toEqual(["agent_duration_ms"]);
    expect(result.aggregation).toBe("avg");
  });

  it("validates args with multiple names", () => {
    const result = MetricAggregateArgsSchema.parse({
      name: ["agent_duration_ms", "total_tokens"],
      aggregation: "sum",
    });
    expect(result.name).toHaveLength(2);
  });

  it("validates all aggregation types", () => {
    const types = ["sum", "avg", "min", "max", "count", "count_distinct"] as const;
    for (const agg of types) {
      const args: Record<string, unknown> = { name: ["m"], aggregation: agg };
      if (agg === "count_distinct") args.distinctColumn = "sessionId";
      const result = MetricAggregateArgsSchema.parse(args);
      expect(result.aggregation).toBe(agg);
    }
  });

  it("validates with comparePeriod", () => {
    const result = MetricAggregateArgsSchema.parse({
      name: ["total_tokens"],
      aggregation: "sum",
      comparePeriod: "previous_week",
    });
    expect(result.comparePeriod).toBe("previous_week");
  });

  it("validates with timestamp range", () => {
    const result = MetricAggregateArgsSchema.parse({
      name: ["total_tokens"],
      aggregation: "sum",
      timestamp: { start: 1000, end: 2000 },
    });
    expect(result.timestamp).toEqual({ start: 1000, end: 2000 });
  });

  it("validates with filters", () => {
    const result = MetricAggregateArgsSchema.parse({
      name: ["total_tokens"],
      aggregation: "sum",
      filters: { model: "gpt-4", tags: ["prod"] },
    });
    expect(result.filters?.model).toBe("gpt-4");
  });

  it("rejects empty name array", () => {
    expect(() =>
      MetricAggregateArgsSchema.parse({
        name: [],
        aggregation: "sum",
      }),
    ).toThrow();
  });

  it("rejects missing name", () => {
    expect(() =>
      MetricAggregateArgsSchema.parse({
        aggregation: "sum",
      }),
    ).toThrow();
  });

  it("rejects invalid aggregation type", () => {
    expect(() =>
      MetricAggregateArgsSchema.parse({
        name: ["m"],
        aggregation: "median",
      }),
    ).toThrow();
  });

  it("rejects missing aggregation", () => {
    expect(() =>
      MetricAggregateArgsSchema.parse({
        name: ["m"],
      }),
    ).toThrow();
  });
});

// --- MetricAggregateResponseSchema ---

describe("MetricAggregateResponseSchema", () => {
  it("validates response with value only", () => {
    const result = MetricAggregateResponseSchema.parse({ value: 42 });
    expect(result.value).toBe(42);
  });

  it("validates response with null value", () => {
    const result = MetricAggregateResponseSchema.parse({ value: null });
    expect(result.value).toBeNull();
  });

  it("validates response with all fields", () => {
    const full: MetricAggregateResponse = {
      value: 100,
      previousValue: 80,
      changePercent: 25,
      estimatedCost: 0.05,
      previousEstimatedCost: 0.04,
      costChangePercent: 25,
    };
    const result = MetricAggregateResponseSchema.parse(full);
    expect(result).toEqual(full);
  });

  it("validates response with null optional fields", () => {
    const result = MetricAggregateResponseSchema.parse({
      value: 100,
      previousValue: null,
      changePercent: null,
      estimatedCost: null,
      previousEstimatedCost: null,
      costChangePercent: null,
    });
    expect(result.previousValue).toBeNull();
    expect(result.changePercent).toBeNull();
    expect(result.estimatedCost).toBeNull();
  });

  it("rejects missing value", () => {
    expect(() => MetricAggregateResponseSchema.parse({})).toThrow();
  });

  it("rejects non-numeric value", () => {
    expect(() =>
      MetricAggregateResponseSchema.parse({ value: "abc" }),
    ).toThrow();
  });
});
