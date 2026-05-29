import { SessionContext } from "./context.js";
import type { AgentContext } from "./context.js";
import type { LLMMessage } from "./index.js";
import { Harness } from "./harness.js";
import type { CheckpointStore } from "./checkpoint-store.js";

export type IsolationMode = "full" | "shared" | "summary";

/** Compaction function injected by caller — avoids core→memory circular dep. */
export type CompactionFn = (messages: LLMMessage[]) => LLMMessage[];

export interface SubHarnessOptions {
  parentSession: SessionContext;
  parentAgent: AgentContext;
  isolation: IsolationMode;
  store: CheckpointStore;
  /** Compaction function for summary mode. Required when isolation="summary". */
  compact?: CompactionFn;
}

export interface SubHarnessResult {
  status: "completed" | "aborted" | "errored";
  childSessionId: string;
  usage: { promptTokens: number; completionTokens: number };
}

/**
 * SubHarness — lightweight Harness wrapper for child agent invocation.
 *
 * Three isolation modes:
 * - full:    child gets independent WorkingMemory, parent context not passed
 * - shared:  child shares parent's WorkingMemory
 * - summary: parent messages compacted via injected CompactionFn before passing
 *
 * Child cost is merged into parent CostTracker.
 */
export class SubHarness {
  private readonly opts: SubHarnessOptions;

  constructor(opts: SubHarnessOptions) {
    this.opts = opts;
  }

  async runChild(childAgent: AgentContext): Promise<SubHarnessResult> {
    const childSessionId = `child_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const childSession = this.createChildSession(childSessionId);

    const harness = new Harness({ store: this.opts.store });
    const result = await harness.runTurn(childSession, childAgent);

    // Merge child cost into parent
    const childTotals = childSession.costTracker.getTotals();
    this.opts.parentSession.costTracker.addUsage(childTotals);

    return {
      status: result.status === "suspended" ? "completed" : result.status,
      childSessionId,
      usage: childTotals,
    };
  }

  private createChildSession(childSessionId: string): SessionContext {
    const childConfig = {
      sessionId: childSessionId,
      llm: this.opts.parentSession.config.llm,
      tools: this.opts.parentSession.config.tools,
      logLevel: this.opts.parentSession.config.logLevel,
    };

    const childSession = new SessionContext(childConfig);
    const parentMessages = this.opts.parentSession.workingMemory.getMessages();

    switch (this.opts.isolation) {
      case "full":
        // Fresh WorkingMemory — no parent context
        break;

      case "shared":
        // Copy parent's WorkingMemory
        for (const msg of parentMessages) {
          childSession.workingMemory.push(msg);
        }
        break;

      case "summary": {
        if (!this.opts.compact) {
          throw new Error("SubHarness: compact function required for summary mode");
        }
        const compacted = this.opts.compact(parentMessages);
        for (const msg of compacted) {
          childSession.workingMemory.push(msg);
        }
        break;
      }
    }

    return childSession;
  }
}
