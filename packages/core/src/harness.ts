import type { SessionContext, AgentContext } from "./context.js";
import { TurnContext, HandlerContext as HandlerContextClass } from "./context.js";
import type { CheckpointStore } from "./checkpoint-store.js";
import type { HandlerResult } from "./handler-engine.js";
import type { PhaseName } from "./index.js";

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

export interface HarnessOptions {
  store: CheckpointStore;
}

export class Harness {
  private readonly store: CheckpointStore;

  constructor(opts: HarnessOptions) {
    this.store = opts.store;
  }

  async runTurn(session: SessionContext, agent: AgentContext): Promise<TurnResult> {
    const turnId = `turn_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const turn = new TurnContext({ turnId, agent, session });
    const ctx = new HandlerContextClass({ agent, session, turn });
    const engine = agent.handlerEngine;

    await engine.emit("turn:start", { turnId, sessionId: session.sessionId });

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
        const frozen = ctx.freeze();
        this.store.saveCheckpoint(frozen);
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

      // Processor is a no-op for now — will be wired per-phase in future issues
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
