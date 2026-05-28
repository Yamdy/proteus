import type { HandlerContext } from "./context.js";
import type { HandlerResult } from "./handler-engine.js";
import type { HandlerEngine } from "./handler-engine.js";
import type { LLMMessage } from "./index.js";

interface PhasePayload extends HandlerContext {
  phaseName: string;
}

// --- ContextAssemblyProcessor ---

export interface ContextAssemblyOptions {
  maxTokens?: number;
  systemPrompt?: string;
}

export class ContextAssemblyProcessor {
  readonly name = "context_assembly";
  private readonly maxTokens: number;
  private readonly systemPrompt: string;

  constructor(opts?: ContextAssemblyOptions) {
    this.maxTokens = opts?.maxTokens ?? 4000;
    this.systemPrompt = opts?.systemPrompt ?? "";
  }

  async handle(ctx: HandlerContext): Promise<HandlerResult> {
    if ((ctx as PhasePayload).phaseName !== "context_assembly") return { ok: true };

    const messages: LLMMessage[] = [];

    // System prompt from fragments
    const systemFragments = ctx.turn.promptFragments.filter((f) => f.role === "system");
    if (systemFragments.length > 0) {
      messages.push({ role: "system", content: systemFragments.map((f) => f.content).join("\n") });
    } else if (this.systemPrompt) {
      messages.push({ role: "system", content: this.systemPrompt });
    }

    // Working memory
    const wmMessages = ctx.session.workingMemory.getMessages();

    // Truncate if over budget
    if (wmMessages.length > this.maxTokens) {
      const truncated = wmMessages.slice(-this.maxTokens);
      messages.push(...truncated);
    } else {
      messages.push(...wmMessages);
    }

    // User prompt fragments
    const userFragments = ctx.turn.promptFragments.filter((f) => f.role === "user");
    for (const f of userFragments) {
      messages.push({ role: "user", content: f.content });
    }

    // Set assembled messages on turn context
    for (const m of messages) {
      ctx.turn.addMessage(m);
    }

    return { ok: true };
  }
}

// --- LLMInferenceProcessor ---

export class LLMInferenceProcessor {
  readonly name = "llm_inference";

  async handle(ctx: HandlerContext): Promise<HandlerResult> {
    if ((ctx as PhasePayload).phaseName !== "llm_inference") return { ok: true };

    const tools = ctx.agent.tools;
    const toolDefs = [...tools.values()].map((t) => t.definition);
    const response = await ctx.agent.llm.chat(ctx.turn.messages, toolDefs);

    // Store assistant response
    ctx.turn.addMessage({
      role: "assistant",
      content: response.content,
      toolCalls: response.toolCalls,
    });

    // Store tool calls for downstream processors
    if (response.toolCalls && response.toolCalls.length > 0) {
      ctx.turn.toolCalls = response.toolCalls;
    }

    // Update cost tracker
    ctx.session.costTracker.addUsage(response.usage);

    return { ok: true };
  }
}

// --- ActionResolutionProcessor ---

export class ActionResolutionProcessor {
  readonly name = "action_resolution";

  async handle(ctx: HandlerContext): Promise<HandlerResult> {
    if ((ctx as PhasePayload).phaseName !== "action_resolution") return { ok: true };

    const toolCalls = ctx.turn.toolCalls;
    if (!toolCalls || toolCalls.length === 0) return { ok: true };

    // Validate all tool calls exist in registry
    for (const tc of toolCalls) {
      if (!ctx.agent.tools.has(tc.name)) {
        return { ok: false, reason: `Tool "${tc.name}" not found in registry` };
      }
    }

    // Store validated actions
    ctx.turn.actions = [...toolCalls];
    return { ok: true };
  }
}

// --- ToolExecutionProcessor ---

export class ToolExecutionProcessor {
  readonly name = "tool_execution";

  async handle(ctx: HandlerContext): Promise<HandlerResult> {
    if ((ctx as PhasePayload).phaseName !== "tool_execution") return { ok: true };

    const actions = ctx.turn.actions;
    if (!actions || actions.length === 0) return { ok: true };

    for (const action of actions) {
      const tool = ctx.agent.tools.get(action.name);
      if (!tool) continue;

      try {
        const result = await tool.execute(action.arguments, ctx.turn);
        ctx.turn.addToolResult(result);
      } catch (err) {
        ctx.turn.addToolResult({
          output: null,
          error: {
            message: err instanceof Error ? err.message : String(err),
            retryable: false,
          },
        });
      }
    }

    return { ok: true };
  }
}

// --- ResultObservationProcessor ---

export class ResultObservationProcessor {
  readonly name = "result_observation";

  async handle(ctx: HandlerContext): Promise<HandlerResult> {
    if ((ctx as PhasePayload).phaseName !== "result_observation") return { ok: true };

    // Append all turn messages to working memory
    for (const msg of ctx.turn.messages) {
      ctx.session.workingMemory.push(msg);
    }

    // Append tool results as tool messages
    for (const tr of ctx.turn.toolResults) {
      ctx.session.workingMemory.push({
        role: "tool",
        content: typeof tr.output === "string" ? tr.output : JSON.stringify(tr.output),
      });
    }

    return { ok: true };
  }
}

// --- registerBuiltInProcessors ---

export function registerBuiltInProcessors(engine: HandlerEngine, opts?: ContextAssemblyOptions): void {
  const contextAssembly = new ContextAssemblyProcessor(opts);
  const llmInference = new LLMInferenceProcessor();
  const actionResolution = new ActionResolutionProcessor();
  const toolExecution = new ToolExecutionProcessor();
  const resultObservation = new ResultObservationProcessor();

  engine.register({
    name: contextAssembly.name,
    phases: ["context_assembly"],
    priority: 10,
    trust: 3,
    handle: (ctx) => contextAssembly.handle(ctx as HandlerContext),
  });

  engine.register({
    name: llmInference.name,
    phases: ["llm_inference"],
    priority: 10,
    trust: 3,
    handle: (ctx) => llmInference.handle(ctx as HandlerContext),
  });

  engine.register({
    name: actionResolution.name,
    phases: ["action_resolution"],
    priority: 10,
    trust: 3,
    handle: (ctx) => actionResolution.handle(ctx as HandlerContext),
  });

  engine.register({
    name: toolExecution.name,
    phases: ["tool_execution"],
    priority: 10,
    trust: 3,
    handle: (ctx) => toolExecution.handle(ctx as HandlerContext),
  });

  engine.register({
    name: resultObservation.name,
    phases: ["result_observation"],
    priority: 10,
    trust: 3,
    handle: (ctx) => resultObservation.handle(ctx as HandlerContext),
  });
}
