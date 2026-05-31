// @proteus/server — Self-Modify API routes
// Provides modification history, detail, and rollback for the Studio frontend.

import type { FastifyInstance } from "fastify";

interface ModifyHistoryEntry {
  commitId: string;
  message: string;
  timestamp: number;
  traceId?: string;
  action: "register" | "replace" | "unregister";
  handlerName: string;
  author?: string;
}

interface ModifyDetail extends ModifyHistoryEntry {
  diff?: {
    before: string;
    after: string;
  };
  metadata?: Record<string, unknown>;
}

// In-memory store for self-modify history
const history: ModifyDetail[] = [];

export async function registerSelfModifyRoutes(
  app: FastifyInstance,
): Promise<void> {
  // GET /self-modify — list all modification history entries
  app.get("/", async () => {
    // Return only the summary fields (no diff) for the list view
    return history.map((entry) => ({
      commitId: entry.commitId,
      message: entry.message,
      timestamp: entry.timestamp,
      traceId: entry.traceId,
      action: entry.action,
      handlerName: entry.handlerName,
      author: entry.author,
    }));
  });

  // GET /self-modify/:commitId — get full detail including diff
  app.get<{ Params: { commitId: string } }>(
    "/:commitId",
    async (request, reply) => {
      const { commitId } = request.params;
      const entry = history.find((h) => h.commitId === commitId);

      if (!entry) {
        return reply.status(404).send({
          error: "Not Found",
          message: `Commit "${commitId}" not found`,
        });
      }

      return entry;
    },
  );

  // POST /self-modify/rollback — rollback to a previous commit
  app.post<{ Body: { commitId: string } }>(
    "/rollback",
    async (request, reply) => {
      const { commitId } = request.body ?? {};

      if (!commitId) {
        return reply.status(400).send({
          error: "Bad Request",
          message: "Body must include 'commitId'",
        });
      }

      const entry = history.find((h) => h.commitId === commitId);
      if (!entry) {
        return reply.status(404).send({
          error: "Not Found",
          message: `Commit "${commitId}" not found`,
        });
      }

      // Mark the entry as rolled back by adding metadata
      entry.metadata = { ...entry.metadata, rolledBack: true, rolledBackAt: Date.now() };

      return { ok: true, message: `Rolled back to commit ${commitId}` };
    },
  );
}
