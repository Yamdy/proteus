// @proteus/server — Thread CRUD REST API routes

import type { FastifyInstance } from "fastify";
import type { ThreadStore, ThreadMeta, LLMMessage } from "@proteus/core";

interface CreateThreadBody {
  name?: string;
  threadId?: string;
}

interface ThreadParams {
  id: string;
}

interface AddMessagesBody {
  messages: LLMMessage[];
}

export interface ThreadRoutesOptions {
  threadStore: ThreadStore;
}

export async function threadRoutes(
  app: FastifyInstance,
  opts: ThreadRoutesOptions,
): Promise<void> {
  const { threadStore } = opts;

  // POST /threads — create a thread
  app.post<{ Body: CreateThreadBody }>(
    "/",
    async (request, reply) => {
      const body = request.body ?? {};
      const threadId = body.threadId ?? `thread-${Date.now()}`;
      const name = body.name ?? threadId;
      const now = Date.now();

      const meta: ThreadMeta = {
        threadId,
        name,
        createdAt: now,
        updatedAt: now,
      };

      try {
        threadStore.createThread(meta);
        return reply.status(201).send({ id: threadId, name, createdAt: now });
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

  // GET /threads — list all threads
  app.get(
    "/",
    async (_request, reply) => {
      const threads = threadStore.listThreads();
      return reply.send(threads.map(t => ({ id: t.threadId, name: t.name, createdAt: t.createdAt })));
    },
  );

  // GET /threads/:id — get a thread by ID
  app.get<{ Params: ThreadParams }>(
    "/:id",
    async (request, reply) => {
      const { id } = request.params;
      const thread = threadStore.loadThread(id);

      if (!thread) {
        return reply.status(404).send({
          error: "Not Found",
          message: `Thread "${id}" not found`,
        });
      }

      return reply.send(thread);
    },
  );

  // DELETE /threads/:id — delete a thread
  app.delete<{ Params: ThreadParams }>(
    "/:id",
    async (request, reply) => {
      const { id } = request.params;
      const thread = threadStore.loadThread(id);

      if (!thread) {
        return reply.status(404).send({
          error: "Not Found",
          message: `Thread "${id}" not found`,
        });
      }

      threadStore.deleteThread(id);
      return reply.status(204).send();
    },
  );

  // GET /threads/:id/messages — fetch messages for a thread
  app.get<{ Params: ThreadParams }>(
    "/:id/messages",
    async (request, reply) => {
      const { id } = request.params;
      const thread = threadStore.loadThread(id);

      if (!thread) {
        return reply.status(404).send({
          error: "Not Found",
          message: `Thread "${id}" not found`,
        });
      }

      const messages = threadStore.loadThreadMessages(id);
      return reply.send(messages);
    },
  );

  // POST /threads/:id/messages — append messages to a thread
  app.post<{ Params: ThreadParams; Body: AddMessagesBody }>(
    "/:id/messages",
    async (request, reply) => {
      const { id } = request.params;
      const thread = threadStore.loadThread(id);

      if (!thread) {
        return reply.status(404).send({
          error: "Not Found",
          message: `Thread "${id}" not found`,
        });
      }

      const { messages } = request.body ?? {};
      if (!messages || !Array.isArray(messages) || messages.length === 0) {
        return reply.status(400).send({
          error: "Bad Request",
          message: "Body must include a non-empty 'messages' array",
        });
      }

      threadStore.addThreadMessages(id, messages);
      threadStore.updateThread(id, { updatedAt: Date.now() });

      const allMessages = threadStore.loadThreadMessages(id);
      return reply.status(201).send(allMessages);
    },
  );
}
