// @proteus/core -- MetricAggregate Zod schemas and types
//
// Defines schemas for metric aggregation queries, dimensional filters,
// and aggregate responses with optional period-over-period comparison.

import { z } from "zod";

// --- comparePeriodSchema ---

export const comparePeriodSchema = z.enum([
  "previous_period",
  "previous_day",
  "previous_week",
]);

export type ComparePeriod = z.infer<typeof comparePeriodSchema>;

// --- MetricsDimensionalFilterSchema ---

export const MetricsDimensionalFilterSchema = z.object({
  entityType: z.string().optional(),
  entityName: z.string().optional(),
  entityId: z.string().optional(),
  sessionId: z.string().optional(),
  threadId: z.string().optional(),
  status: z.string().optional(),
  tags: z.array(z.string()).optional(),
  model: z.string().optional(),
  provider: z.string().optional(),
  parentEntityType: z.string().optional(),
  parentEntityName: z.string().optional(),
  toolName: z.string().optional(),
  phaseName: z.string().optional(),
  handlerName: z.string().optional(),
  agentId: z.string().optional(),
  workflowId: z.string().optional(),
});

export type MetricsDimensionalFilter = z.infer<typeof MetricsDimensionalFilterSchema>;

// --- MetricAggregateArgsSchema ---

const aggregationSchema = z.enum([
  "sum",
  "avg",
  "min",
  "max",
  "count",
  "count_distinct",
]);

export const MetricAggregateArgsSchema = z
  .object({
    name: z.array(z.string()).nonempty(),
    aggregation: aggregationSchema,
    distinctColumn: z.string().optional(),
    filters: MetricsDimensionalFilterSchema.optional(),
    comparePeriod: comparePeriodSchema.optional(),
    timestamp: z
      .object({ start: z.number(), end: z.number() })
      .optional(),
  })
  .refine(
    (data) =>
      data.aggregation !== "count_distinct" || data.distinctColumn !== undefined,
    {
      message: "distinctColumn is required when aggregation is 'count_distinct'",
      path: ["distinctColumn"],
    },
  );

export type MetricAggregateArgs = z.infer<typeof MetricAggregateArgsSchema>;

// --- MetricAggregateResponseSchema ---

export const MetricAggregateResponseSchema = z.object({
  value: z.number().nullable(),
  previousValue: z.number().nullable().optional(),
  changePercent: z.number().nullable().optional(),
  estimatedCost: z.number().nullable().optional(),
  previousEstimatedCost: z.number().nullable().optional(),
  costChangePercent: z.number().nullable().optional(),
});

export type MetricAggregateResponse = z.infer<typeof MetricAggregateResponseSchema>;
