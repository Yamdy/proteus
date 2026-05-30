// @proteus/server — GET /chat/:sessionId/stream SSE streaming inference endpoint

import type { FastifyInstance } from "fastify";
import type { SessionManager, AgentContext, LLMMessage, LLMResponse, ToolDefinition } from "@proteus/core";

interface StreamQuery {
  message: string;
}

interface StreamParams {
  sessionId: string;
}

export interface SseRouteDeps {
  sessionManager: SessionManager;
  agent: AgentContext;
}

/** SSE event envelope sent to the client. */
export interface SseEvent {
  /** Event type: "chunk" for incremental content, "done" for final summary, "error" for failures. */
  event: "chunk" | "done" | "error";
  /** Incremental content delta (only present for chunk events). */
  content?: string;
  /** Tool calls from the LLM response (present on done if any). */
  toolCalls?: LLMResponse["toolCalls"];
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
  const { sessionManager, agent } = deps;

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
        "X-Accel-Buffering": "no", // disable nginx buffering
      });

      // Push user message into working memory
      const userMsg: LLMMessage = { role: "user", content: message };
      session.workingMemory.push(userMsg);

      // Gather messages and tool definitions for the LLM call
      const messages = session.workingMemory.getMessages();
      const toolDefs: ToolDefinition[] = [];
      for (const tool of agent.tools.values()) {
        toolDefs.push(tool.definition);
      }

      // Track accumulated content for the final "done" event
      let fullContent = "";
      let lastUsage: LLMResponse["usage"] = { promptTokens: 0, completionTokens: 0 };
      let lastFinishReason: LLMResponse["finishReason"] = "stop";
      let lastToolCalls: LLMResponse["toolCalls"];

      try {
        const stream = agent.llm.chatStream(messages, toolDefs);

        for await (const chunk of stream) {
          // Accumulate content
          if (chunk.content) {
            fullContent += chunk.content;
          }

          // Track latest metadata
          if (chunk.usage) {
            lastUsage = chunk.usage;
          }
          if (chunk.finishReason) {
            lastFinishReason = chunk.finishReason;
          }
          if (chunk.toolCalls) {
            lastToolCalls = chunk.toolCalls;
          }

          // Send incremental chunk event (only if there is content to stream)
          if (chunk.content) {
            const event: SseEvent = {
              event: "chunk",
              content: chunk.content,
            };
            reply.raw.write(formatSse(event));
          }
        }

        // Stream finished — push assistant response into working memory
        if (fullContent || lastToolCalls) {
          session.workingMemory.push({
            role: "assistant",
            content: fullContent,
            toolCalls: lastToolCalls,
          });
        }

        // Send final "done" event with complete metadata
        const doneEvent: SseEvent = {
          event: "done",
          content: fullContent,
          toolCalls: lastToolCalls,
          usage: lastUsage,
          finishReason: lastFinishReason,
        };
        reply.raw.write(formatSse(doneEvent));
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : "Unknown streaming error";
        const errorEvent: SseEvent = {
          event: "error",
          message: errMsg,
        };
        reply.raw.write(formatSse(errorEvent));
      } finally {
        reply.raw.end();
      }
    },
  );
}
