// @proteus/core — public API surface

// --- Handler Engine ---
export { HandlerEngine, registerBuiltins, BUILTIN_HANDLERS } from "./handler-engine.js";
export type { HandlerResult, HandlerFn, HandlerSnapshot, RegistrySnapshot } from "./handler-engine.js";

// --- Three-Region Context ---
export {
  AgentContext,
  SessionContext,
  TurnContext,
  HandlerContext,
  FrozenContext,
  CostTracker,
  WorkingMemory,
} from "./context.js";
export type { HandlerEngineHandle } from "./context.js";

// --- CheckpointStore ---
export { InMemoryCheckpointStore } from "./checkpoint-store.js";
export type { CheckpointStore, SessionMeta, StoreEvent, ConfigSnapshot, CostRecord } from "./checkpoint-store.js";
export { SqliteCheckpointStore } from "./sqlite-checkpoint-store.js";

// --- Harness ---
export { Harness } from "./harness.js";
export type { TurnResult, ChainResult, ChainOptions, HarnessOptions } from "./harness.js";

// --- Lifecycle ---
export { LifecycleStateMachine } from "./lifecycle.js";
export type { LifecycleState, LifecycleEvent } from "./lifecycle.js";

// --- DevServer ---
export { DevServer } from "./dev-server.js";
export type { DevServerOptions, SSEEvent } from "./dev-server.js";

// --- PromptFragment ---

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
  handle: (ctx: unknown) => Promise<import("./handler-engine.js").HandlerResult>;
}

// --- Session & Memory ---

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
