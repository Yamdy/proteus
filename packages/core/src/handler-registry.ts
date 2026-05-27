import type { HandlerDefinition, PhaseName } from "./index.js";
import type { HandlerFn } from "./event-bus.js";

interface RegisteredHandler {
  handler: HandlerDefinition;
  insertionOrder: number;
}

export interface HandlerSnapshot {
  name: string;
  phases?: PhaseName[];
  events?: string[];
  priority?: number;
  trust: 0 | 1 | 2 | 3;
  builtin: boolean;
}

export interface RegistrySnapshot {
  handlers: HandlerSnapshot[];
}

const BUILTIN_HANDLERS: HandlerDefinition[] = [
  {
    name: "checkpoint",
    events: ["turn:end"],
    priority: 10,
    trust: 3,
    builtin: true,
    handle: async () => ({ ok: true }),
  },
  {
    name: "cost-tracker",
    events: ["llm:response"],
    priority: 20,
    trust: 3,
    builtin: true,
    handle: async () => ({ ok: true }),
  },
  {
    name: "otel-bridge",
    phases: ["context_assembly", "llm_inference", "action_resolution", "tool_execution", "result_observation"],
    events: ["phase:before", "phase:after"],
    priority: 30,
    trust: 3,
    builtin: true,
    handle: async () => ({ ok: true }),
  },
  {
    name: "freeze-guard",
    events: ["phase:before"],
    priority: 5,
    trust: 3,
    builtin: true,
    handle: async () => ({ ok: true }),
  },
];

export class HandlerRegistry {
  private handlers: RegisteredHandler[] = [];
  private nextOrder = 0;

  constructor() {
    for (const h of BUILTIN_HANDLERS) {
      this.register(h);
    }
  }

  register(handler: HandlerDefinition): void {
    this.handlers.push({ handler, insertionOrder: this.nextOrder++ });
  }

  unregister(name: string): void {
    const rh = this.handlers.find((rh) => rh.handler.name === name);
    if (rh?.handler.builtin) {
      throw new Error(`Cannot unregister built-in handler "${name}"`);
    }
    this.handlers = this.handlers.filter((rh) => rh.handler.name !== name);
  }

  replace(name: string, handler: HandlerDefinition): void {
    const index = this.handlers.findIndex((rh) => rh.handler.name === name);
    if (index === -1) {
      throw new Error(`Handler "${name}" not found`);
    }
    if (this.handlers[index].handler.builtin) {
      throw new Error(`Cannot replace built-in handler "${name}"`);
    }
    this.handlers[index] = { handler, insertionOrder: this.handlers[index].insertionOrder };
  }

  getHandlers(event: string): HandlerDefinition[] {
    return this.handlers
      .filter((rh) => !rh.handler.events || rh.handler.events.includes(event))
      .sort((a, b) => {
        const priorityDiff = (a.handler.priority ?? 100) - (b.handler.priority ?? 100);
        return priorityDiff !== 0 ? priorityDiff : a.insertionOrder - b.insertionOrder;
      })
      .map((rh) => rh.handler);
  }

  serialize(): RegistrySnapshot {
    return {
      handlers: this.handlers.map((rh) => ({
        name: rh.handler.name,
        phases: rh.handler.phases,
        events: rh.handler.events,
        priority: rh.handler.priority,
        trust: rh.handler.trust,
        builtin: rh.handler.builtin ?? false,
      })),
    };
  }

  static deserialize(
    snapshot: RegistrySnapshot,
    handlerSources: Record<string, HandlerFn>,
  ): HandlerRegistry {
    const registry = new HandlerRegistry();
    for (const sh of snapshot.handlers) {
      if (sh.builtin) continue; // already registered by constructor
      const handle = handlerSources[sh.name];
      if (!handle) {
        throw new Error(`Handler function not found for "${sh.name}"`);
      }
      registry.register({
        name: sh.name,
        phases: sh.phases,
        events: sh.events,
        priority: sh.priority,
        trust: sh.trust,
        builtin: sh.builtin,
        handle,
      });
    }
    return registry;
  }
}
