import { z } from "zod";
import type { WorkerPool } from "./worker-pool.js";
import type { HandlerDefinition } from "./types.js";
import type { HandlerResult } from "./types.js";

const HandlerResultSchema = z.union([
  z.object({ ok: z.literal(true), value: z.unknown().optional(), transform: z.boolean().optional() }),
  z.object({ ok: z.literal(false), reason: z.string() }),
  z.object({ abort: z.boolean(), reason: z.string(), retryFrom: z.number().optional() }),
  z.object({ suspend: z.boolean(), pendingInput: z.unknown().optional() }),
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function buildContextSnapshot(ctx: unknown): Record<string, unknown> {
  if (ctx === null || ctx === undefined || !isPlainObject(ctx)) return {};

  const snapshot: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(ctx)) {
    if (typeof value === "function") continue;
    if (isPlainObject(value)) {
      snapshot[key] = buildContextSnapshot(value);
    } else if (Array.isArray(value)) {
      snapshot[key] = value.map((item) =>
        isPlainObject(item) ? buildContextSnapshot(item) : item,
      );
    } else {
      snapshot[key] = value;
    }
  }
  return snapshot;
}

export class WorkerHandlerRunner {
  constructor(private readonly pool: WorkerPool) {}

  async run(handler: HandlerDefinition, contextSnapshot: unknown): Promise<HandlerResult> {
    const result = await this.pool.submit({
      handlerName: handler.name,
      handlerSource: handler.handle.toString(),
      eventName: handler.events?.[0] ?? "",
      contextSnapshot,
    });

    if (!result.ok) {
      return { error: new Error(result.error), recoverable: result.recoverable };
    }

    const parsed = HandlerResultSchema.safeParse(result.handlerResult);
    if (!parsed.success) {
      return {
        error: new Error(`Invalid handler result: ${parsed.error.message}`),
        recoverable: false,
      };
    }

    return parsed.data as HandlerResult;
  }
}
