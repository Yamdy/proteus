import type {
  LLMProvider,
  LLMMessage,
  Tool,
  SessionConfig,
  PromptFragment,
  ToolResult,
  HandlerDefinition,
} from "./index.js";
import type { HandlerResult } from "./event-bus.js";

// --- Placeholder for HandlerRegistry (#3 will provide real one) ---

export interface HandlerRegistryLike {
  getHandlers(event: string): HandlerDefinition[];
}

// --- CostTracker ---

export class CostTracker {
  private promptTokens = 0;
  private completionTokens = 0;

  addUsage(usage: { promptTokens: number; completionTokens: number }): void {
    this.promptTokens += usage.promptTokens;
    this.completionTokens += usage.completionTokens;
  }

  getTotals(): { promptTokens: number; completionTokens: number } {
    return { promptTokens: this.promptTokens, completionTokens: this.completionTokens };
  }
}

// --- WorkingMemory ---

export class WorkingMemory {
  private messages: LLMMessage[] = [];

  push(entry: LLMMessage): void {
    this.messages.push(entry);
  }

  getMessages(): LLMMessage[] {
    return [...this.messages];
  }

  truncate(maxTokens: number): void {
    // Simple truncation: keep last N messages (token counting is provider-specific)
    if (this.messages.length > maxTokens) {
      this.messages = this.messages.slice(-maxTokens);
    }
  }

  clear(): void {
    this.messages = [];
  }
}

// --- AgentContext (process-level) ---

export class AgentContext {
  readonly llm: LLMProvider;
  readonly tools: Map<string, Tool>;
  readonly handlerRegistry: HandlerRegistryLike;

  constructor(params: {
    llm: LLMProvider;
    tools: Map<string, Tool>;
    handlerRegistry?: HandlerRegistryLike;
  }) {
    this.llm = params.llm;
    this.tools = params.tools;
    this.handlerRegistry = params.handlerRegistry ?? { getHandlers: () => [] };
  }
}

// --- SessionContext (per-connection, persisted) ---

export class SessionContext {
  readonly sessionId: string;
  readonly config: SessionConfig;
  readonly workingMemory: WorkingMemory;
  readonly costTracker: CostTracker;

  constructor(config: SessionConfig) {
    this.sessionId = config.sessionId;
    this.config = config;
    this.workingMemory = new WorkingMemory();
    this.costTracker = new CostTracker();
  }
}

// --- TurnContext (per-turn, ephemeral) ---

export class TurnContext {
  readonly turnId: string;
  readonly agent: AgentContext;
  readonly session: SessionContext;
  readonly messages: LLMMessage[] = [];
  readonly toolResults: ToolResult[] = [];
  readonly promptFragments: PromptFragment[] = [];

  constructor(params: {
    turnId: string;
    agent: AgentContext;
    session: SessionContext;
  }) {
    this.turnId = params.turnId;
    this.agent = params.agent;
    this.session = params.session;
  }

  addMessage(msg: LLMMessage): void {
    this.messages.push(msg);
  }

  addToolResult(result: ToolResult): void {
    this.toolResults.push(result);
  }

  addPromptFragment(fragment: PromptFragment): void {
    this.promptFragments.push(fragment);
  }
}

// --- HandlerContext (composite passed to handlers) ---

export class HandlerContext {
  readonly agent: AgentContext;
  readonly session: SessionContext;
  readonly turn: TurnContext;

  constructor(params: {
    agent: AgentContext;
    session: SessionContext;
    turn: TurnContext;
  }) {
    this.agent = params.agent;
    this.session = params.session;
    this.turn = params.turn;
  }

  freeze(timestamp?: number): FrozenContext {
    return FrozenContext.from(this, timestamp);
  }
}

// --- FrozenContext (deep-readonly snapshot) ---

function simpleHash(data: string): string {
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return Math.abs(hash).toString(36);
}

export class FrozenContext {
  readonly timestamp: number;
  readonly checksum: string;
  readonly sessionId: string;
  readonly turnId: string;
  readonly messages: readonly LLMMessage[];
  readonly toolResults: readonly ToolResult[];
  readonly promptFragments: readonly PromptFragment[];
  readonly costTotals: { promptTokens: number; completionTokens: number };

  private constructor(params: {
    timestamp: number;
    checksum: string;
    sessionId: string;
    turnId: string;
    messages: LLMMessage[];
    toolResults: ToolResult[];
    promptFragments: PromptFragment[];
    costTotals: { promptTokens: number; completionTokens: number };
  }) {
    this.timestamp = params.timestamp;
    this.checksum = params.checksum;
    this.sessionId = params.sessionId;
    this.turnId = params.turnId;
    this.messages = Object.freeze(params.messages);
    this.toolResults = Object.freeze(params.toolResults);
    this.promptFragments = Object.freeze(params.promptFragments);
    this.costTotals = Object.freeze(params.costTotals);
  }

  static from(ctx: HandlerContext, timestamp?: number): FrozenContext {
    const ts = timestamp ?? Date.now();
    const data = {
      sessionId: ctx.session.sessionId,
      turnId: ctx.turn.turnId,
      messages: ctx.turn.messages,
      toolResults: ctx.turn.toolResults,
      promptFragments: ctx.turn.promptFragments,
      costTotals: ctx.session.costTracker.getTotals(),
    };
    const payload = JSON.stringify(data);
    const checksum = simpleHash(payload);
    return new FrozenContext({ timestamp: ts, checksum, ...data });
  }
}
