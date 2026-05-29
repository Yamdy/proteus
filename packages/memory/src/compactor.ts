import type { LLMMessage } from "@proteus/core";
import type { CompactionResult } from "./types.js";

export interface ContextCompactorOptions {
  /** Number of most-recent messages to keep verbatim. Default: 10 */
  recentCount?: number;
}

/**
 * ContextCompactor — four-step context window compression.
 *
 * 1. Keep system prompt (role=system messages)
 * 2. Keep recent N messages verbatim
 * 3. Summarize the middle region (stub: single placeholder message)
 * 4. Discard tool results (role=tool messages)
 */
export class ContextCompactor {
  private readonly recentCount: number;

  constructor(opts?: ContextCompactorOptions) {
    this.recentCount = opts?.recentCount ?? 10;
  }

  compact(messages: LLMMessage[]): CompactionResult {
    if (messages.length === 0) {
      return { messages: [], originalCount: 0, compactedCount: 0, strategy: "full" };
    }

    // Step 1: Separate system messages
    const systemMessages = messages.filter((m) => m.role === "system");

    // Step 4: Discard tool results
    const nonToolMessages = messages.filter((m) => m.role !== "tool");

    // Step 2: Keep recent N (from non-system, non-tool messages)
    const nonSystemNonTool = nonToolMessages.filter((m) => m.role !== "system");

    if (nonSystemNonTool.length <= this.recentCount) {
      // No compaction needed
      return {
        messages: [...nonToolMessages],
        originalCount: messages.length,
        compactedCount: nonToolMessages.length,
        strategy: "full",
      };
    }

    const recent = nonSystemNonTool.slice(-this.recentCount);
    const middle = nonSystemNonTool.slice(0, -this.recentCount);

    // Step 3: Summarize middle (stub)
    const result: LLMMessage[] = [...systemMessages];

    if (middle.length > 0) {
      result.push({
        role: "assistant",
        content: `[compacted: ${middle.length} messages summarized]`,
      });
    }

    result.push(...recent);

    return {
      messages: result,
      originalCount: messages.length,
      compactedCount: result.length,
      strategy: "compacted",
    };
  }
}
