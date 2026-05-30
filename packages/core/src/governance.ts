import type { EventLog, StoreEvent } from "./checkpoint-store.js";
import type { HandlerDefinition, HandlerResult, PhaseName } from "./types.js";
import type { HandlerEngine } from "./handler-engine.js";
import type { HandlerContext } from "./context.js";

// --- PermissionPolicy ---

export interface PermissionDecision {
  allowed: boolean;
  reason?: string;
}

export interface PermissionPolicy {
  canExecute(
    toolName: string,
    params?: Record<string, unknown>,
    ctx?: HandlerContext,
  ): PermissionDecision | Promise<PermissionDecision>;
}

// --- AllowAllPolicy ---

export class AllowAllPolicy implements PermissionPolicy {
  canExecute(_toolName: string, _params?: Record<string, unknown>, _ctx?: HandlerContext): PermissionDecision {
    return { allowed: true };
  }
}

// --- DenyListPolicy ---

export class DenyListPolicy implements PermissionPolicy {
  private readonly denySet: ReadonlySet<string>;

  constructor(tools: readonly string[]) {
    this.denySet = new Set(tools);
  }

  canExecute(toolName: string, _params?: Record<string, unknown>, _ctx?: HandlerContext): PermissionDecision {
    if (this.denySet.has(toolName)) {
      return { allowed: false, reason: `Tool "${toolName}" is in the deny list` };
    }
    return { allowed: true };
  }
}

// --- ResponsePolicy ---

export type ResponseDecision =
  | { action: "allow" }
  | { action: "suspend"; pendingInput?: unknown }
  | { action: "abort"; reason: string };

export interface ResponsePolicy {
  evaluate(
    ctx: HandlerContext,
  ): ResponseDecision | Promise<ResponseDecision>;
}

// --- GovernanceManager ---

export interface GovernanceManagerOptions {
  policies: PermissionPolicy[];
  responsePolicies?: ResponsePolicy[];
  eventLog?: EventLog;
}

export class GovernanceManager {
  private readonly policies: readonly PermissionPolicy[];
  private readonly responsePolicies: readonly ResponsePolicy[];
  private readonly eventLog?: EventLog;

  constructor(opts: GovernanceManagerOptions) {
    this.policies = opts.policies;
    this.responsePolicies = opts.responsePolicies ?? [];
    this.eventLog = opts.eventLog;
  }

  registerBeforeTool(engine: HandlerEngine): void {
    engine.register({
      name: "governance:before-tool",
      phases: ["tool_execution" as PhaseName],
      events: ["phase:before"],
      priority: 1,
      trust: 3,
      builtin: true,
      handle: (ctx) => this.handleBeforeTool(ctx),
    });
  }

  registerBeforeResponse(engine: HandlerEngine): void {
    engine.register({
      name: "governance:before-response",
      phases: ["result_observation" as PhaseName],
      events: ["phase:before"],
      priority: 1,
      trust: 3,
      builtin: true,
      handle: (ctx) => this.handleBeforeResponse(ctx),
    });
  }

  private async handleBeforeTool(ctx: HandlerContext): Promise<HandlerResult> {
    const actions = ctx.turn.actions;
    if (!actions || actions.length === 0) return { ok: true };

    for (const action of actions) {
      const decision = await this.checkPolicies(action.name, action.arguments, ctx);
      if (!decision.allowed) {
        const reason = decision.reason ?? "denied by policy";
        this.writeDecision(ctx, action.name, action.arguments, reason);
        return { ok: false, reason };
      }
    }

    return { ok: true };
  }

  private async handleBeforeResponse(ctx: HandlerContext): Promise<HandlerResult> {
    for (const policy of this.responsePolicies) {
      const decision = await policy.evaluate(ctx);
      if (decision.action === "suspend") {
        return { suspend: true, pendingInput: decision.pendingInput };
      }
      if (decision.action === "abort") {
        return { abort: true, reason: decision.reason };
      }
    }
    return { ok: true };
  }

  private async checkPolicies(
    toolName: string,
    params: Record<string, unknown>,
    ctx: HandlerContext,
  ): Promise<PermissionDecision> {
    for (const policy of this.policies) {
      const result = await policy.canExecute(toolName, params, ctx);
      if (!result.allowed) return result;
    }
    return { allowed: true };
  }

  private writeDecision(
    ctx: HandlerContext,
    toolName: string,
    params: Record<string, unknown>,
    reason: string,
  ): void {
    if (!this.eventLog) return;
    const event: StoreEvent = {
      sessionId: ctx.session.sessionId,
      event: "governance:decision",
      payload: {
        hookType: "phase:before",
        toolName,
        params,
        decision: "denied",
        reason,
        traceId: ctx.turn.turnId,
      },
      timestamp: Date.now(),
    };
    this.eventLog.appendEvent(event);
  }
}

// --- AuditEntry ---

export interface AuditEntry {
  timestamp: number;
  hookType: string;
  toolName: string;
  decision: "approved" | "denied";
  reason: string;
  traceId: string;
}

// --- GovernanceHandler ---

export class GovernanceHandler {
  private readonly eventLog: EventLog;

  constructor(eventLog: EventLog) {
    this.eventLog = eventLog;
  }

  handleAfterTool(ctx: HandlerContext): void {
    const { session, turn } = ctx;
    const actions = turn.actions ?? [];
    const toolResults = turn.toolResults;

    let resultIdx = 0;
    for (const action of actions) {
      const toolExists = ctx.agent.tools.has(action.name);

      if (!toolExists) {
        const entry: AuditEntry = {
          timestamp: Date.now(),
          hookType: "phase:after",
          toolName: action.name,
          decision: "denied",
          reason: "tool not found in registry",
          traceId: turn.turnId,
        };
        this.appendAuditEntry(session.sessionId, entry);
        continue;
      }

      const result = toolResults[resultIdx];
      resultIdx++;

      const hasError = result?.error != null;
      const entry: AuditEntry = {
        timestamp: Date.now(),
        hookType: "phase:after",
        toolName: action.name,
        decision: hasError ? "denied" : "approved",
        reason: hasError ? result!.error!.message : "tool execution succeeded",
        traceId: turn.turnId,
      };
      this.appendAuditEntry(session.sessionId, entry);
    }
  }

  private appendAuditEntry(sessionId: string, entry: AuditEntry): void {
    const event: StoreEvent = {
      sessionId,
      event: "governance:decision",
      payload: entry,
      timestamp: entry.timestamp,
    };
    this.eventLog.appendEvent(event);
  }
}

// --- Handler factory ---

export function createGovernanceHandlers(eventLog: EventLog): HandlerDefinition[] {
  const gov = new GovernanceHandler(eventLog);

  return [
    {
      name: "governance:after-tool",
      phases: ["tool_execution" as PhaseName],
      events: ["phase:after"],
      priority: 50,
      trust: 3,
      builtin: true,
      handle: async (ctx) => {
        gov.handleAfterTool(ctx);
        return { ok: true };
      },
    },
  ];
}

// --- Registration helper ---

export function registerGovernance(engine: HandlerEngine, eventLog: EventLog): void {
  for (const h of createGovernanceHandlers(eventLog)) {
    engine.register(h);
  }
}

// --- GovernanceHooks ---

export type BeforeLlmHook = (ctx: HandlerContext) => Promise<HandlerResult | void> | HandlerResult | void;

function isShortCircuit(result: HandlerResult): boolean {
  if ("ok" in result) return !result.ok;
  if ("abort" in result) return result.abort;
  if ("suspend" in result) return result.suspend;
  if ("error" in result) return result.recoverable === false;
  return false;
}

export class GovernanceHooks {
  private readonly engine: HandlerEngine;
  private readonly beforeLlmHooks: BeforeLlmHook[] = [];
  private beforeLlmRegistered = false;

  constructor(engine: HandlerEngine) {
    this.engine = engine;
  }

  registerBeforeLlm(hook: BeforeLlmHook): this {
    this.beforeLlmHooks.push(hook);
    if (!this.beforeLlmRegistered) {
      this.beforeLlmRegistered = true;
      this.engine.register({
        name: "governance-hooks:before-llm",
        phases: ["context_assembly" as PhaseName],
        events: ["phase:before"],
        priority: 100,
        trust: 3,
        builtin: true,
        handle: (ctx) => this.executeBeforeLlmHooks(ctx),
      });
    }
    return this;
  }

  private async executeBeforeLlmHooks(ctx: HandlerContext): Promise<HandlerResult> {
    let lastResult: HandlerResult | undefined;
    for (const hook of this.beforeLlmHooks) {
      const result = await hook(ctx);
      if (result != null) {
        lastResult = result as HandlerResult;
        if (isShortCircuit(lastResult)) {
          return lastResult;
        }
      }
    }
    return lastResult ?? { ok: true };
  }
}
