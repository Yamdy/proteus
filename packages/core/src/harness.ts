import { SessionContext, TurnContext, HandlerContext as HandlerContextClass, FrozenContext } from "./context.js";
import type { AgentContext } from "./context.js";
import type { CheckpointLog } from "./checkpoint-store.js";
import type { HandlerResult } from "./types.js";
import type { PhaseName } from "./types.js";
import { LifecycleStateMachine } from "./lifecycle.js";

const PHASES: PhaseName[] = [
  "context_assembly",
  "llm_inference",
  "action_resolution",
  "tool_execution",
  "result_observation",
];

export interface TurnResult {
  status: "completed" | "aborted" | "suspended" | "errored";
  turnId: string;
  error?: Error;
  suspendInput?: unknown;
}

export interface ChainOptions {
  maxTurns?: number;
  abortSignal?: AbortSignal;
}

export interface ChainResult {
  status: "completed" | "max_turns" | "aborted" | "suspended" | "errored";
  turns: number;
  error?: Error;
}

export interface HarnessOptions {
  store: CheckpointLog;
}

export class Harness {
  private readonly store: CheckpointLog;
  readonly lifecycle: LifecycleStateMachine;

  constructor(opts: HarnessOptions) {
    this.store = opts.store;
    this.lifecycle = new LifecycleStateMachine();
  }

  async runTurn(session: SessionContext, agent: AgentContext): Promise<TurnResult> {
    if (this.lifecycle.state === "pending") {
      this.lifecycle.transition("start");
    }

    const turnId = `turn_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const turn = new TurnContext({ turnId, agent, session });
    const ctx = new HandlerContextClass({ agent, session, turn });

    return this.executePhases(ctx, turnId, session.sessionId, agent);
  }

  async resume(sessionId: string, agent: AgentContext, externalInput?: unknown): Promise<TurnResult> {
    const checkpoint = this.store.loadLatestCheckpoint(sessionId);
    if (!checkpoint || checkpoint.resumeReason !== "suspend") {
      throw new Error(`No suspend checkpoint found for session "${sessionId}"`);
    }

    this.lifecycle.transition("resume");

    const turnId = `turn_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const session = new SessionContext({
      sessionId,
      llm: { provider: "unknown", model: "unknown", temperature: 0 },
      tools: {},
      logLevel: "info",
    });
    const turn = new TurnContext({ turnId, agent, session });
    turn.externalInput = externalInput;
    const ctx = new HandlerContextClass({ agent, session, turn });

    return this.executePhases(ctx, turnId, sessionId, agent);
  }

  async runChain(session: SessionContext, agent: AgentContext, opts?: ChainOptions): Promise<ChainResult> {
    const maxTurns = opts?.maxTurns ?? 10;
    const abortSignal = opts?.abortSignal;
    const chainId = `chain_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const engine = agent.handlerEngine;

    await engine.emit("chain:start", { chainId, sessionId: session.sessionId });

    for (let i = 0; i < maxTurns; i++) {
      if (abortSignal?.aborted) {
        await engine.emit("chain:end", { chainId, sessionId: session.sessionId, status: "aborted", turns: i });
        return { status: "aborted", turns: i };
      }

      const result = await this.runTurn(session, agent);

      if (result.status === "suspended") {
        await engine.emit("chain:end", { chainId, sessionId: session.sessionId, status: "suspended", turns: i + 1 });
        return { status: "suspended", turns: i + 1 };
      }
      if (result.status === "aborted") {
        await engine.emit("chain:end", { chainId, sessionId: session.sessionId, status: "aborted", turns: i + 1 });
        return { status: "aborted", turns: i + 1 };
      }
      if (result.status === "errored") {
        await engine.emit("chain:end", { chainId, sessionId: session.sessionId, status: "errored", turns: i + 1 });
        return { status: "errored", turns: i + 1, error: result.error };
      }
      // completed — continue to next turn
    }

    await engine.emit("chain:end", { chainId, sessionId: session.sessionId, status: "max_turns", turns: maxTurns });
    return { status: "max_turns", turns: maxTurns };
  }

  async resumeChain(sessionId: string, agent: AgentContext, externalInput?: unknown, opts?: ChainOptions): Promise<ChainResult> {
    const maxTurns = opts?.maxTurns ?? 10;
    const abortSignal = opts?.abortSignal;
    const chainId = `chain_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const engine = agent.handlerEngine;

    await engine.emit("chain:start", { chainId, sessionId });

    const resumeResult = await this.resume(sessionId, agent, externalInput);

    if (resumeResult.status === "suspended") {
      await engine.emit("chain:end", { chainId, sessionId, status: "suspended", turns: 1 });
      return { status: "suspended", turns: 1 };
    }
    if (resumeResult.status === "aborted") {
      await engine.emit("chain:end", { chainId, sessionId, status: "aborted", turns: 1 });
      return { status: "aborted", turns: 1 };
    }
    if (resumeResult.status === "errored") {
      await engine.emit("chain:end", { chainId, sessionId, status: "errored", turns: 1 });
      return { status: "errored", turns: 1, error: resumeResult.error };
    }

    // Reconstruct session for subsequent turns
    const session = new SessionContext({
      sessionId,
      llm: { provider: "unknown", model: "unknown", temperature: 0 },
      tools: {},
      logLevel: "info",
    });

    // Resume turn completed — continue chain for remaining turns
    for (let i = 1; i < maxTurns; i++) {
      if (abortSignal?.aborted) {
        await engine.emit("chain:end", { chainId, sessionId, status: "aborted", turns: i });
        return { status: "aborted", turns: i };
      }

      const result = await this.runTurn(session, agent);

      if (result.status === "suspended") {
        await engine.emit("chain:end", { chainId, sessionId, status: "suspended", turns: i + 1 });
        return { status: "suspended", turns: i + 1 };
      }
      if (result.status === "aborted") {
        await engine.emit("chain:end", { chainId, sessionId, status: "aborted", turns: i + 1 });
        return { status: "aborted", turns: i + 1 };
      }
      if (result.status === "errored") {
        await engine.emit("chain:end", { chainId, sessionId, status: "errored", turns: i + 1 });
        return { status: "errored", turns: i + 1, error: result.error };
      }
    }

    await engine.emit("chain:end", { chainId, sessionId, status: "completed", turns: maxTurns });
    return { status: "completed", turns: maxTurns };
  }

  private async executePhases(ctx: HandlerContextClass, turnId: string, sessionId: string, agent: AgentContext): Promise<TurnResult> {
    const engine = agent.handlerEngine;

    await engine.emit("turn:start", { turnId, sessionId });

    for (const phaseName of PHASES) {
      const phasePayload = { phaseName, ...ctx };

      const beforeResults = await engine.emit("phase:before", phasePayload);
      const blockResult = this.findBlock(beforeResults);
      if (blockResult) {
        await engine.emit("turn:end", { turnId, status: "aborted" });
        return { status: "aborted", turnId };
      }

      const suspendResult = this.findSuspend(beforeResults);
      if (suspendResult) {
        const frozen = FrozenContext.forSuspend(ctx, suspendResult.pendingInput);
        this.store.saveCheckpoint(frozen);
        this.lifecycle.transition("suspend");
        await engine.emit("turn:end", { turnId, status: "suspended" });
        return { status: "suspended", turnId, suspendInput: suspendResult.pendingInput };
      }

      const abortResult = this.findAbort(beforeResults);
      if (abortResult) {
        await engine.emit("turn:end", { turnId, status: "aborted" });
        return { status: "aborted", turnId };
      }

      const errorResult = this.findTerminalError(beforeResults);
      if (errorResult) {
        await engine.emit("turn:end", { turnId, status: "errored" });
        return { status: "errored", turnId, error: errorResult.error };
      }

      await engine.emit("phase:after", phasePayload);
    }

    const frozen = ctx.freeze();
    this.store.saveCheckpoint(frozen);
    await engine.emit("turn:end", { turnId, status: "completed" });

    return { status: "completed", turnId };
  }

  private findBlock(results: HandlerResult[]): HandlerResult | undefined {
    return results.find((r) => "ok" in r && !r.ok);
  }

  private findSuspend(results: HandlerResult[]): { pendingInput?: unknown } | undefined {
    return results.find((r) => "suspend" in r && r.suspend) as any;
  }

  private findAbort(results: HandlerResult[]): HandlerResult | undefined {
    return results.find((r) => "abort" in r && r.abort);
  }

  private findTerminalError(results: HandlerResult[]): { error: Error } | undefined {
    return results.find((r) => "error" in r && r.recoverable === false) as any;
  }
}
