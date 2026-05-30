// @proteus/server — POST /chat synchronous inference endpoint

import type { FastifyInstance } from "fastify";
import type { SessionManager, Harness, AgentContext, LLMMessage } from "@proteus/core";

interface ChatBody {
  sessionId: string;
  message: string;
}

export interface ChatRouteDeps {
  sessionManager: SessionManager;
  harness: Harness;
  agent: AgentContext;
}

export async function registerChatRoutes(
  app: FastifyInstance,
  deps: ChatRouteDeps,
): Promise<void> {
  const { sessionManager, harness, agent } = deps;

  // POST /chat — synchronous inference
  app.post<{ Body: ChatBody }>(
    "/",
    async (request, reply) => {
      const { sessionId, message } = request.body ?? {};

      if (!sessionId || !message) {
        return reply.status(400).send({
          error: "Bad Request",
          message: "Body must include sessionId and message",
        });
      }

      // Look up session
      const session = sessionManager.get(sessionId);
      if (!session) {
        return reply.status(404).send({
          error: "Not Found",
          message: `Session "${sessionId}" not found`,
        });
      }

      // Push user message into working memory
      const userMsg: LLMMessage = { role: "user", content: message };
      session.workingMemory.push(userMsg);

      try {
        // Run a full inference turn through the harness
        const result = await harness.runTurn(session, agent);

        // Extract the assistant response from working memory.
        // After a completed turn, ResultObservationProcessor pushes the
        // assistant message into session.workingMemory.
        const messages = session.workingMemory.getMessages();
        const lastAssistant = [...messages]
          .reverse()
          .find((m) => m.role === "assistant");

        const response = lastAssistant?.content ?? "";

        return reply.send({
          turnId: result.turnId,
          status: result.status,
          response,
        });
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : "Unknown error";
        return reply.status(500).send({
          error: "Internal Server Error",
          message: errMsg,
        });
      }
    },
  );
}
