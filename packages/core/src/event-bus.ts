export type HandlerResult =
  | { ok: true; value?: unknown; transform?: boolean }
  | { ok: false; reason: string }
  | { abort: boolean; reason: string; retryFrom?: number }
  | { suspend: boolean; pendingInput?: unknown }
  | { error: Error; recoverable?: boolean };

export type HandlerFn = (ctx: unknown) => Promise<HandlerResult>;

interface RegisteredHandler {
  name: string;
  priority: number;
  handle: HandlerFn;
}

export class EventBus {
  private handlers = new Map<string, RegisteredHandler[]>();

  on(event: string, handler: HandlerFn, priority = 100, name = ""): void {
    const list = this.handlers.get(event) ?? [];
    list.push({ name, priority, handle: handler });
    list.sort((a, b) => a.priority - b.priority);
    this.handlers.set(event, list);
  }

  async emit(event: string, payload: unknown): Promise<HandlerResult[]> {
    const list = this.handlers.get(event) ?? [];
    const results: HandlerResult[] = [];
    for (const h of list) {
      results.push(await h.handle(payload));
    }
    return results;
  }
}
