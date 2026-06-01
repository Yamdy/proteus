// @proteus/core — Span record types, interfaces, and Zod schemas

import { z } from "zod";

// --- Zod Schemas ---

export const SpanTypeSchema = z.string();

export const SpanStatusSchema = z.enum(["running", "success", "error"]);

export const TokenUsageSchema = z.object({
  inputTokens: z.number().optional(),
  outputTokens: z.number().optional(),
  cacheReadTokens: z.number().optional(),
  cacheWriteTokens: z.number().optional(),
  totalTokens: z.number().optional(),
});

export const SpanRecordSchema = z.object({
  traceId: z.string(),
  spanId: z.string(),
  parentSpanId: z.string().optional(),
  name: z.string(),
  type: SpanTypeSchema,
  startTime: z.number(),
  endTime: z.number().optional(),
  status: SpanStatusSchema,
  input: z.unknown().optional(),
  output: z.unknown().optional(),
  metadata: z.record(z.unknown()).optional(),
  attributes: z.record(z.unknown()).optional(),
  tokenUsage: TokenUsageSchema.optional(),
});

export const TraceSummarySchema = z.object({
  traceId: z.string(),
  name: z.string(),
  type: z.string(),
  status: SpanStatusSchema,
  startTime: z.number(),
  endTime: z.number().optional(),
  latency: z.number().optional(),
  entityName: z.string().optional(),
  rootEntityType: z.string().optional(),
});

export const ListTracesArgsSchema = z.object({
  page: z.number().optional(),
  limit: z.number().optional(),
  rootEntityType: z.string().optional(),
  status: SpanStatusSchema.optional(),
  entityName: z.string().optional(),
  entityId: z.string().optional(),
  tags: z.array(z.string()).optional(),
  sessionId: z.string().optional(),
  since: z.number().optional(),
  mode: z.enum(["delta"]).optional(),
});

export const PaginatedResponseSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({
    data: z.array(itemSchema),
    total: z.number(),
    page: z.number(),
    limit: z.number(),
    hasMore: z.boolean(),
  });

// --- Inferred types ---

export type SpanRecord = z.infer<typeof SpanRecordSchema>;
export type TraceSummary = z.infer<typeof TraceSummarySchema>;
export type ListTracesArgs = z.infer<typeof ListTracesArgsSchema>;
export type PaginatedResponse<T> = {
  data: T[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
};

// --- SpanStore interface ---

export interface SpanStore {
  addSpan(span: SpanRecord): void;
  getTraceSpans(traceId: string): SpanRecord[];
  listTraces(args: ListTracesArgs): PaginatedResponse<TraceSummary>;
  getTraceSummary(traceId: string): TraceSummary | null;
}
