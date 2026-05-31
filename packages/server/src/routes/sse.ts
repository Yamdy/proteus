// @proteus/server — GET /chat/:sessionId/stream SSE streaming inference endpoint
//
// Streams LLM tokens via SSE by routing through the Harness (not calling
// the LLM directly). This ensures governance, OTel, cost tracking, and
// checkpointing all fire for streaming requests — same guarantees as
// synchronous POST /chat.

import type { FastifyInstance } from "fastify";
import type { SessionManager, Harness, AgentContext, LLMMessage, LLMResponse } from "@proteus/core";

interface StreamQuery {
  message: string;
}

interface StreamParams {
  sessionId: string;
}

export interface SseRouteDeps {
  sessionManager: SessionManager;
  harness: Harness;
  agent: AgentContext;
}

/** SSE event envelope sent to the client. */
export interface SseEvent {
  /** Event type: "chunk" for incremental content, "done" for final summary, "error" for failures. */
  event: "chunk" | "done" | "error";
  /** Incremental content delta (only present for chunk events). */
  content?: string;
  /** Token usage summary (present on done). */
  usage?: LLMResponse["usage"];
  /** Finish reason (present on done). */
  finishReason?: LLMResponse["finishReason"];
  /** Error message (present on error events). */
  message?: string;
}

/**
 * Serializes an SSE event to `data: JSON\n\n` wire format.
 */
export function formatSse(payload: SseEvent): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

export async function registerSseRoutes(
  app: FastifyInstance,
  deps: SseRouteDeps,
): Promise<void> {
  const { sessionManager, harness, agent } = deps;

  app.get<{ Params: StreamParams; Querystring: StreamQuery }>(
    "/:sessionId/stream",
    async (request, reply) => {
      const { sessionId } = request.params;
      const { message } = request.query;

      // --- Validation ---
      if (!message) {
        return reply.status(400).send({
          error: "Bad Request",
          message: "Query parameter 'message' is required",
        });
      }

      const session = sessionManager.get(sessionId);
      if (!session) {
        return reply.status(404).send({
          error: "Not Found",
          message: `Session "${sessionId}" not found`,
        });
      }

      // --- Set SSE headers ---
      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });

      // Push user message into working memory
      const userMsg: LLMMessage = { role: "user", content: message };
      session.workingMemory.push(userMsg);

      // --- Run turn through Harness with per-turn onToken callback ---
      try {
        const result = await harness.runTurn(session, agent, {
          callbacks: {
            onToken: (token: string) => {
              const event: SseEvent = { event: "chunk", content: token };
              reply.raw.write(formatSse(event));
            },
          },
        });

        // Read cost totals from the session's cost tracker
        const totals = session.costTracker.getTotals();

        // Send final "done" event
        const doneEvent: SseEvent = {
          event: "done",
          usage: { promptTokens: totals.promptTokens, completionTokens: totals.completionTokens },
          finishReason: result.status === "completed" ? "stop" : "error",
        };
        reply.raw.write(formatSse(doneEvent));
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : "Unknown streaming error";
        const errorEvent: SseEvent = { event: "error", message: errMsg };
        reply.raw.write(formatSse(errorEvent));
      } finally {
        reply.raw.end();
      }
    },
  );
}
