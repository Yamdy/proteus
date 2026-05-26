// @proteus/core — public API surface

// --- Turn & Chain ---

export interface TurnContext {
  sessionId: string;
  turnId: string;
  chainId: string;
  get(key: string): unknown;
  set(key: string, value: unknown): void;
  getToolResults(): ToolResult[];
  getPromptFragments(): PromptFragment[];
}

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
    context: TurnContext,
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

// --- Hook & Plugin ---

export type HookPoint =
  | "context:assembly"
  | "llm:inference"
  | "action:resolution"
  | "tool:execution"
  | "result:observation";

export type PluginNature = "observer" | "interceptor";

export interface PluginManifest {
  name: string;
  version: string;
  trust: "trusted" | "isolated" | "sandboxed";
  permissions?: string[];
}

export interface ObserverPlugin {
  manifest: PluginManifest & { trust: "observer" };
  onHook(hookPoint: HookPoint, context: Readonly<TurnContext>): void;
}

export interface InterceptorPlugin {
  manifest: PluginManifest;
  onHook(
    hookPoint: HookPoint,
    context: TurnContext,
    next: () => Promise<void>,
  ): Promise<void>;
}

export type Plugin = ObserverPlugin | InterceptorPlugin;

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

export interface WorkingMemory {
  push(entry: LLMMessage): void;
  getMessages(): LLMMessage[];
  truncate(maxTokens: number): void;
  clear(): void;
}

// --- Agent Loop ---

export interface AgentLoopCallbacks {
  onTurnStart?(turn: TurnContext): void;
  onTurnEnd?(turn: TurnContext, result: ToolResult[]): void;
  onChainEnd?(chainId: string): void;
  onError?(error: Error, context: TurnContext): void;
}

export interface AgentLoopConfig {
  maxTurns: number;
  maxTokensPerTurn: number;
  truncationStrategy: "fifo" | "summarize";
}
