// @proteus/core — canonical type definitions
//
// This module defines all core domain types. Other modules import types
// from here instead of from index.ts, which breaks the circular dependency
// chain that previously ran through the barrel.

import type { HandlerContext } from "./context.js";
import type { HandlerResult } from "./handler-engine.js";

// Re-export for consumers that need these types via @proteus/core/types
export type { HandlerContext } from "./context.js";
export type { HandlerResult } from "./handler-engine.js";

// --- Prompt Fragment ---

export interface PromptFragment {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  name?: string;
  metadata?: Record<string, unknown>;
}

// --- Tool ---

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema
  builtin?: boolean;
}

export interface ToolResult {
  output: unknown;
  artifacts?: Artifact[];
  error?: { message: string; retryable: boolean };
}

export interface Artifact {
  type: string;
  data: unknown;
  metadata?: Record<string, unknown>;
}

export interface Tool {
  definition: ToolDefinition;
  execute(
    params: Record<string, unknown>,
    context: import("./context.js").TurnContext,
  ): Promise<ToolResult>;
}

// --- LLM Provider ---

export interface LLMMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  thinking?: string;
  toolCalls?: ToolCall[];
  toolCallId?: string;
  name?: string;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface LLMResponse {
  content: string;
  thinking?: string;
  toolCalls?: ToolCall[];
  usage: { promptTokens: number; completionTokens: number };
  finishReason: "stop" | "tool_call" | "length" | "error";
}

export interface LLMProvider {
  chat(messages: LLMMessage[], tools: ToolDefinition[]): Promise<LLMResponse>;
  chatStream(
    messages: LLMMessage[],
    tools: ToolDefinition[],
  ): AsyncIterable<LLMResponse>;
  countTokens(text: string): number;
}

// --- Handler ---

export type PhaseName =
  | "context_assembly"
  | "llm_inference"
  | "action_resolution"
  | "tool_execution"
  | "result_observation";

export interface HandlerDefinition {
  name: string;
  phases?: PhaseName[];
  events?: string[];
  priority?: number;
  trust: 0 | 1 | 2 | 3;
  builtin?: boolean;
  handle: (ctx: HandlerContext) => Promise<HandlerResult>;
}

// --- Session ---

export interface SessionConfig {
  sessionId: string;
  llm: {
    provider: string;
    model: string;
    temperature: number;
  };
  tools: Record<string, boolean>; // tool name → enabled
  logLevel: "debug" | "info" | "warn" | "error";
}
