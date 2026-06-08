// Zod schemas for AgentDefinition and AgentRegistryEntry

import { z } from "zod";

export const AgentDefinitionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  systemPrompt: z.string(),
  tools: z.array(z.string()).optional(),
  model: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const AgentRegistryEntrySchema = z.object({
  definition: AgentDefinitionSchema,
  registeredAt: z.number(),
});

export type InferredAgentDefinition = z.infer<typeof AgentDefinitionSchema>;
export type InferredAgentRegistryEntry = z.infer<typeof AgentRegistryEntrySchema>;
