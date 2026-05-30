// @proteus/core -- SessionConfig Zod schemas
//
// Runtime validation schemas that mirror the TypeScript interfaces in types.ts.
// Use `z.infer<typeof Schema>` to extract the matching TypeScript type.

import { z } from "zod";

// --- SessionLLMConfig ---

export const SessionLLMConfigSchema = z.object({
  provider: z.string(),
  model: z.string(),
  temperature: z.number(),
});

export type SessionLLMConfig = z.infer<typeof SessionLLMConfigSchema>;

// --- SessionConfig ---

export const SessionConfigSchema = z.object({
  sessionId: z.string(),
  llm: SessionLLMConfigSchema,
  tools: z.record(z.string(), z.boolean()),
  logLevel: z.enum(["debug", "info", "warn", "error"]),
});

export type SessionConfigInferred = z.infer<typeof SessionConfigSchema>;
