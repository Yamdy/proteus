// Zod schema for HandlerResult discriminated union

import { z } from "zod";

/**
 * Zod schema for HandlerResult.
 *
 * HandlerResult is a union of 5 variants with different discriminant keys,
 * so we use z.union (not z.discriminatedUnion).
 */
export const HandlerResultSchema = z.union([
  // ok: true — success
  z.object({
    ok: z.literal(true),
    value: z.unknown().optional(),
    transform: z.boolean().optional(),
  }),

  // ok: false — failure with reason
  z.object({
    ok: z.literal(false),
    reason: z.string(),
  }),

  // abort — abort execution
  z.object({
    abort: z.literal(true),
    reason: z.string(),
    retryFrom: z.number().int().optional(),
  }),

  // suspend — suspend execution (human-in-the-loop)
  z.object({
    suspend: z.literal(true),
    pendingInput: z.unknown().optional(),
  }),

  // error — error with optional recoverable flag
  z.object({
    error: z.instanceof(Error),
    recoverable: z.boolean().optional(),
  }),
]);

export type InferredHandlerResult = z.infer<typeof HandlerResultSchema>;
