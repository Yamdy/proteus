// @proteus/core — canonical type definitions
//
// This module defines all core domain types. Other modules import types
// from here instead of from index.ts, which breaks the circular dependency
// chain that previously ran through the barrel.
//
// Cross-module references use import() for lazy type resolution.
// Schema-inferred types are imported then re-exported so they create
// local bindings (required by downstream interfaces in this file).

import type { InferredToolDefinition, InferredToolResult, InferredArtifact } from './schemas/tool.js';
import type { InferredHandlerResult } from './schemas/handler.js';
import type { SessionConfigInferred } from './schemas/session.js';
import type { InferredAgentDefinition, InferredAgentRegistryEntry } from './schemas/agent.js';

// --- Prompt Fragment ---

export interface PromptFragment {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  name?: string;
  metadata?: Record<string, unknown>;
}

// --- Tool ---

export type ToolDefinition = InferredToolDefinition;
export type ToolResult = InferredToolResult;
export type Artifact = InferredArtifact;

export interface ToolContext {
  turnId: string;
  sessionId: string;
}

export interface Tool {
  definition: ToolDefinition;
  execute(
    params: Record<string, unknown>,
    context: ToolContext,
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

export type HandlerResult = InferredHandlerResult;

export type HandlerFn = (ctx: import("./context.js").HandlerContext) => Promise<HandlerResult>;

export interface HandlerDefinition {
  name: string;
  phases?: PhaseName[];
  events?: string[];
  priority?: number;
  trust: 0 | 1 | 2 | 3;
  builtin?: boolean;
  handle: (ctx: import("./context.js").HandlerContext) => Promise<HandlerResult>;
}

// --- Session ---

export type SessionConfig = SessionConfigInferred;

// --- Sandbox ---

export interface SandboxOptions {
  /** Maximum memory in megabytes available to the sandbox. */
  memoryMb?: number;
  /** Whether the sandbox is allowed to access the network. Defaults to true. */
  networkAccess?: boolean;
  /** Host-to-guest mount points. */
  mounts?: SandboxMount[];
}

export interface SandboxMount {
  /** Absolute path on the host filesystem. */
  host: string;
  /** Path inside the sandbox (relative to root). */
  guest: string;
  /** If true the guest path is read-only. */
  readonly?: boolean;
}

export interface SandboxResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface SandboxHandle {
  /** Run a command inside the sandbox. */
  execute(command: string, args?: string[]): Promise<SandboxResult>;
  /** Read a file from the sandbox filesystem. */
  readFile(path: string): Promise<string>;
  /** Write a file into the sandbox filesystem. */
  writeFile(path: string, content: string): Promise<void>;
  /** Tear down the sandbox and release all resources. */
  destroy(): Promise<void>;
}

// --- Agent Registry ---

export type AgentDefinition = InferredAgentDefinition;
export type AgentRegistryEntry = InferredAgentRegistryEntry;

// --- Agent Router ---

/** Result returned by an AgentRouter after delegating a task to an agent. */
export interface AgentRouterResult {
  output: string;
  status: "completed" | "errored" | "timed_out";
  error?: string;
}

/**
 * A function that routes a task to a specific agent and returns its response.
 *
 * Implementations decide how to invoke the agent (Harness, SubHarness,
 * remote HTTP call, etc.). The Agent-as-Tool layer only cares about the
 * input/output contract.
 */
export type AgentRouter = (
  agentId: string,
  task: string,
  context?: string,
) => Promise<AgentRouterResult>;

// --- Agent-as-Tool Config ---

export interface AgentToolConfig {
  /** ID of the agent to wrap. Must match an entry in the AgentRegistry. */
  agentId: string;
  /** Human-readable description shown to the calling LLM. Falls back to the agent's own description. */
  description?: string;
  /** Maximum time in milliseconds to wait for the agent to respond. Defaults to 60 000 ms. */
  timeout?: number;
}
