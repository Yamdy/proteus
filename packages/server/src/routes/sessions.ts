// @proteus/server — Session CRUD REST API routes

import type { FastifyInstance } from "fastify";
import type { SessionManager, SessionConfig } from "@proteus/core";

interface CreateSessionBody {
  sessionId: string;
  config: SessionConfig;
}

interface SessionParams {
  id: string;
}

export async function sessionRoutes(
  app: FastifyInstance,
  opts: { sessionManager: SessionManager },
): Promise<void> {
  const { sessionManager } = opts;

  // POST /sessions — create a session
  app.post<{ Body: CreateSessionBody }>(
    "/",
    async (request, reply) => {
      const { sessionId, config } = request.body;

      if (!sessionId || !config) {
        return reply.status(400).send({
          error: "Bad Request",
          message: "Body must include sessionId and config",
        });
      }

      try {
        const session = sessionManager.create(sessionId, config);
        return reply.status(201).send({
          sessionId,
          config: session.config,
        });
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

  // GET /sessions — list all sessions
  app.get(
    "/",
    async (_request, reply) => {
      const ids = sessionManager.list();
      return reply.send({ sessions: ids });
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

      return reply.send({
        sessionId: id,
        config: session.config,
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
}
