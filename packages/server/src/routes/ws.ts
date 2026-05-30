// @proteus/server — WebSocket real-time event push

import type { FastifyInstance } from "fastify";
import type { EventLog, StoreEvent } from "@proteus/core";

// --- EventBus: bridges EventLog append with WS subscribers ---

type Subscriber = (event: StoreEvent) => void;

export class EventBus {
  private subscribers = new Map<string, Set<Subscriber>>();
  private globalSubscribers = new Set<Subscriber>();

  constructor(private readonly eventLog?: EventLog) {}

  /** Subscribe to events for a specific session. */
  subscribe(sessionId: string, fn: Subscriber): () => void {
    let set = this.subscribers.get(sessionId);
    if (!set) {
      set = new Set();
      this.subscribers.set(sessionId, set);
    }
    set.add(fn);
    return () => {
      set!.delete(fn);
      if (set!.size === 0) this.subscribers.delete(sessionId);
    };
  }

  /** Subscribe to all events across every session. */
  subscribeAll(fn: Subscriber): () => void {
    this.globalSubscribers.add(fn);
    return () => {
      this.globalSubscribers.delete(fn);
    };
  }

  /**
   * Publish an event. Appends to the EventLog (if available)
   * and notifies all matching subscribers.
   */
  publish(event: StoreEvent): void {
    // Persist
    this.eventLog?.appendEvent(event);

    // Notify session-specific subscribers
    const set = this.subscribers.get(event.sessionId);
    if (set) {
      for (const fn of set) {
        try {
          fn(event);
        } catch {
          // subscriber errors must not break the bus
        }
      }
    }

    // Notify global subscribers
    for (const fn of this.globalSubscribers) {
      try {
        fn(event);
      } catch {
        // subscriber errors must not break the bus
      }
    }
  }
}

// --- WS protocol types ---

interface ClientMessage {
  action: "subscribe" | "unsubscribe";
  sessionId: string;
}

interface ServerPush {
  event: string;
  payload?: unknown;
  timestamp: number;
}

// --- Route registration ---

export interface WsRoutesOptions {
  eventBus: EventBus;
}

export async function registerWsRoutes(
  app: FastifyInstance,
  opts: WsRoutesOptions,
): Promise<void> {
  const { eventBus } = opts;

  app.get(
    "/ws",
    { websocket: true } as any,
    (socket: any, _req: any) => {
      // Track per-connection unsubscribers so we clean up on close
      const unsubs: Array<() => void> = [];

      socket.on("message", (raw: Buffer | string) => {
        let msg: ClientMessage;
        try {
          msg = JSON.parse(typeof raw === "string" ? raw : raw.toString());
        } catch {
          socket.send(JSON.stringify({ error: "Invalid JSON" }));
          return;
        }

        if (msg.action === "subscribe" && msg.sessionId) {
          const unsub = eventBus.subscribe(msg.sessionId, (evt) => {
            const push: ServerPush = {
              event: evt.event,
              payload: evt.payload,
              timestamp: evt.timestamp,
            };
            try {
              socket.send(JSON.stringify(push));
            } catch {
              // client disconnected
            }
          });
          unsubs.push(unsub);

          // Acknowledge subscription
          socket.send(
            JSON.stringify({
              action: "subscribed",
              sessionId: msg.sessionId,
            }),
          );
        } else if (msg.action === "unsubscribe" && msg.sessionId) {
          socket.send(
            JSON.stringify({
              action: "unsubscribed",
              sessionId: msg.sessionId,
            }),
          );
        }
      });

      socket.on("close", () => {
        for (const unsub of unsubs) unsub();
        unsubs.length = 0;
      });
    },
  );
}
