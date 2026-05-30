import type { LLMMessage, LLMProvider } from "@proteus/core";
import type { CompactionResult } from "./types.js";

/** Strategy for summarizing the middle (compacted) region. */
export type SummaryStrategy = "truncation" | "llm";

export interface ContextCompactorOptions {
  /** Number of most-recent messages to keep verbatim. Default: 10 */
  recentCount?: number;
  /** LLM provider used when summaryStrategy is "llm". */
  llmProvider?: LLMProvider;
  /** Summarization strategy. Default: "truncation" (backward-compatible stub). */
  summaryStrategy?: SummaryStrategy;
  /** Max tokens for the LLM summary output. Default: 256 */
  summaryMaxTokens?: number;
  /** Custom prompt template for LLM summarization. */
  summaryPrompt?: string;
}

const DEFAULT_SUMMARY_PROMPT =
  "You are a context summarizer. Condense the following conversation into a concise bullet-point summary that preserves all key facts, decisions, and action items.";

/**
 * ContextCompactor — four-step context window compression.
 *
 * 1. Keep system prompt (role=system messages)
 * 2. Keep recent N messages verbatim
 * 3. Summarize the middle region (truncation stub or LLM-powered)
 * 4. Discard tool results (role=tool messages)
 */
export class ContextCompactor {
  private readonly recentCount: number;
  private readonly llmProvider: LLMProvider | undefined;
  private readonly summaryStrategy: SummaryStrategy;
  private readonly summaryPrompt: string;

  constructor(opts?: ContextCompactorOptions) {
    this.recentCount = opts?.recentCount ?? 10;
    this.llmProvider = opts?.llmProvider;
    this.summaryStrategy = opts?.summaryStrategy ?? "truncation";
    this.summaryPrompt = opts?.summaryPrompt ?? DEFAULT_SUMMARY_PROMPT;
  }

  async compact(messages: LLMMessage[], previousResult?: CompactionResult): Promise<CompactionResult> {
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

    // Step 3: Summarize middle (incremental if previous summary exists)
    const result: LLMMessage[] = [...systemMessages];
    let summary: string | undefined;
    let summarizedCount = 0;
    let usedLLM = false;

    if (middle.length > 0) {
      const previousSummary = previousResult?.summary;
      const previousSummarizedCount = previousResult?.summarizedCount ?? 0;

      // Incremental: only summarize new messages beyond what was already summarized
      const newMessages = previousSummary
        ? middle.slice(previousSummarizedCount)
        : middle;

      summarizedCount = middle.length;

      if (newMessages.length > 0) {
        const llmResult = await this.summarizeMiddle(newMessages, previousSummary);
        summary = llmResult.summary;
        usedLLM = llmResult.usedLLM;
        result.push({ role: "assistant", content: summary });
      } else if (previousSummary) {
        // No new messages, reuse previous summary
        summary = previousSummary;
        result.push({ role: "assistant", content: summary });
      }
    }

    result.push(...recent);

    return {
      messages: result,
      originalCount: messages.length,
      compactedCount: result.length,
      strategy: usedLLM ? "llm" : "compacted",
      summary,
      summarizedCount,
    };
  }

  private async summarizeMiddle(
    middle: LLMMessage[],
    previousSummary?: string,
  ): Promise<{ summary: string; usedLLM: boolean }> {
    if (this.summaryStrategy === "llm" && this.llmProvider) {
      try {
        const summary = await this.summarizeWithLLM(middle, previousSummary);
        return { summary, usedLLM: true };
      } catch {
        // LLM failed, fall through to truncation
      }
    }
    // Default "truncation" strategy — backward-compatible stub
    const newPart = `[compacted: ${middle.length} messages summarized]`;
    const summary = previousSummary ? `${previousSummary}\n${newPart}` : newPart;
    return { summary, usedLLM: false };
  }

  private async summarizeWithLLM(middle: LLMMessage[], previousSummary?: string): Promise<string> {
    const conversationText = middle
      .map((m) => `${m.role}: ${m.content}`)
      .join("\n");

    const incrementalPrompt = previousSummary
      ? `${this.summaryPrompt}\n\nPrevious summary:\n${previousSummary}\n\nIncrementally update the summary with the following new messages. Merge the new information into the previous summary, preserving all key facts.`
      : this.summaryPrompt;

    const promptMessages: LLMMessage[] = [
      { role: "system", content: incrementalPrompt },
      { role: "user", content: conversationText },
    ];

    const response = await this.llmProvider!.chat(promptMessages, []);
    return response.content;
  }
}
