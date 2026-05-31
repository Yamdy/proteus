// @proteus/server — Session CRUD REST API routes
// Matches the API contract expected by the Studio frontend.

import type { FastifyInstance } from "fastify";
import type { SessionManager, SessionConfig, Harness, AgentContext, LLMMessage } from "@proteus/core";

interface CreateSessionBody {
  name?: string;
  sessionId?: string;
  config?: SessionConfig;
}

interface SessionParams {
  id: string;
}

interface SessionView {
  id: string;
  name: string;
  createdAt: number;
}

function toSessionView(sessionId: string, config: SessionConfig): SessionView {
  return {
    id: sessionId,
    name: (config as any).name ?? sessionId,
    createdAt: (config as any).createdAt ?? Date.now(),
  };
}

export interface SessionRoutesOptions {
  sessionManager: SessionManager;
  harness?: Harness;
  agent?: AgentContext;
}

export async function sessionRoutes(
  app: FastifyInstance,
  opts: SessionRoutesOptions,
): Promise<void> {
  const { sessionManager, harness, agent } = opts;

  // POST /sessions — create a session
  app.post<{ Body: CreateSessionBody }>(
    "/",
    async (request, reply) => {
      const body = request.body ?? {};
      const sessionId = body.sessionId ?? `sess-${Date.now()}`;
      const name = body.name ?? sessionId;

      const config: SessionConfig = body.config ?? {
        sessionId,
        llm: { provider: "default", model: "default", temperature: 0.7 },
        tools: {},
        logLevel: "info",
      };

      // Store name and createdAt in config for later retrieval
      const enrichedConfig = { ...config, name, createdAt: Date.now() };

      try {
        sessionManager.create(sessionId, enrichedConfig);
        return reply.status(201).send(toSessionView(sessionId, enrichedConfig));
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : "Unknown error";
        if (message.includes("already exists")) {
          return reply.status(409).send({
            error: "Conflict",
            message,
          });
        }
        throw err;
      }
    },
  );

  // GET /sessions — list all sessions as SessionView[]
  app.get(
    "/",
    async (_request, reply) => {
      const ids = sessionManager.list();
      const sessions: SessionView[] = ids.map((id) => {
        const session = sessionManager.get(id);
        const cfg = session?.config as any;
        return {
          id,
          name: cfg?.name ?? id,
          createdAt: cfg?.createdAt ?? Date.now(),
        };
      });
      return reply.send(sessions);
    },
  );

  // GET /sessions/:id — get a session by ID
  app.get<{ Params: SessionParams }>(
    "/:id",
    async (request, reply) => {
      const { id } = request.params;
      const session = sessionManager.get(id);

      if (!session) {
        return reply.status(404).send({
          error: "Not Found",
          message: `Session "${id}" not found`,
        });
      }

      const cfg = session.config as unknown as Record<string, unknown>;
      return reply.send({
        id,
        name: (cfg.name as string) ?? id,
        createdAt: (cfg.createdAt as number) ?? Date.now(),
      });
    },
  );

  // DELETE /sessions/:id — destroy a session
  app.delete<{ Params: SessionParams }>(
    "/:id",
    async (request, reply) => {
      const { id } = request.params;
      const session = sessionManager.get(id);

      if (!session) {
        return reply.status(404).send({
          error: "Not Found",
          message: `Session "${id}" not found`,
        });
      }

      sessionManager.destroy(id);
      return reply.status(204).send();
    },
  );

  // POST /sessions/:id/stream — SSE streaming chat (matches Studio frontend)
  app.post<{ Params: SessionParams; Body: { content?: string; message?: string } }>(
    "/:id/stream",
    async (request, reply) => {
      const { id } = request.params;
      const content = request.body?.content ?? request.body?.message;

      if (!content) {
        return reply.status(400).send({
          error: "Bad Request",
          message: "Body must include 'content' or 'message'",
        });
      }

      const session = sessionManager.get(id);
      if (!session) {
        return reply.status(404).send({
          error: "Not Found",
          message: `Session "${id}" not found`,
        });
      }

      // Set SSE headers
      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });

      // Real Harness inference when available
      if (harness && agent) {
        const userMsg: LLMMessage = { role: "user", content };
        session.workingMemory.push(userMsg);

        try {
          await harness.runTurn(session, agent, {
            callbacks: {
              onToken: (token: string) => {
                reply.raw.write(`data: ${JSON.stringify({ content: token })}\n\n`);
              },
            },
          });
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : "Unknown error";
          reply.raw.write(`data: ${JSON.stringify({ error: errMsg })}\n\n`);
        }

        reply.raw.write("data: [DONE]\n\n");
        reply.raw.end();
        return;
      }

      // Fallback: simulated streaming (no LLM available)
      const responseText = `Received: ${content}`;
      const chunks = responseText.match(/.{1,20}/g) ?? [responseText];

      for (const chunk of chunks) {
        reply.raw.write(`data: ${JSON.stringify({ content: chunk })}\n\n`);
        await new Promise((r) => setTimeout(r, 50));
      }

      reply.raw.write("data: [DONE]\n\n");
      reply.raw.end();
    },
  );
}
