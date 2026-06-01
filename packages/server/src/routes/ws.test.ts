import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ProteusServer } from "../server.js";
import { InMemoryEventLog } from "@proteus/core";
import type { StoreEvent } from "@proteus/core";
import { EventBus } from "./ws.js";
import WebSocket from "ws";

// Helper: create a WS client connected to the test server
function connectWs(port: number): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    ws.on("open", () => resolve(ws));
    ws.on("error", reject);
  });
}

// Helper: wait for the next message from a WS client
function nextMessage(ws: WebSocket): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Timed out waiting for message")),
      5000,
    );
    ws.once("message", (data) => {
      clearTimeout(timer);
      resolve(JSON.parse(data.toString()));
    });
  });
}

describe("WebSocket /ws routes", () => {
  let server: ProteusServer;
  let eventLog: InMemoryEventLog;
  let eventBus: EventBus;
  const clients: WebSocket[] = [];

  beforeEach(() => {
    eventLog = new InMemoryEventLog();
    eventBus = new EventBus(eventLog);
    server = new ProteusServer({
      port: 0,
      eventLog,
      eventBus,
    });
  });

  afterEach(async () => {
    for (const ws of clients) {
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
    }
    clients.length = 0;
    if (server) {
      await server.stop();
    }
  });

  async function startAndGetPort(): Promise<number> {
    await server.start();
    const address = server.instance.server.address();
    if (typeof address === "object" && address) {
      return address.port;
    }
    throw new Error("Could not get server port");
  }

  it("accepts WebSocket connections", async () => {
    const port = await startAndGetPort();
    const ws = await connectWs(port);
    clients.push(ws);

    expect(ws.readyState).toBe(WebSocket.OPEN);
  });

  it("acknowledges a subscribe action", async () => {
    const port = await startAndGetPort();
    const ws = await connectWs(port);
    clients.push(ws);

    const ackPromise = nextMessage(ws);
    ws.send(JSON.stringify({ action: "subscribe", sessionId: "s1" }));

    const ack = await ackPromise;
    expect(ack).toEqual({ action: "subscribed", sessionId: "s1" });
  });

  it("pushes events to subscribed clients", async () => {
    const port = await startAndGetPort();
    const ws = await connectWs(port);
    clients.push(ws);

    // Subscribe
    const ackPromise = nextMessage(ws);
    ws.send(JSON.stringify({ action: "subscribe", sessionId: "s1" }));
    await ackPromise;

    // Publish an event via the EventBus
    const eventPushPromise = nextMessage(ws);
    const storeEvent: StoreEvent = {
      sessionId: "s1",
      event: "turn:start",
      payload: { turnId: "t1" },
      timestamp: 1000,
    };
    eventBus.publish(storeEvent);

    const push = await eventPushPromise;
    expect(push.event).toBe("turn:start");
    expect(push.payload).toEqual({ turnId: "t1" });
    expect(push.timestamp).toBe(1000);
  });

  it("does not push events for unsubscribed sessions", async () => {
    const port = await startAndGetPort();
    const ws = await connectWs(port);
    clients.push(ws);

    // Subscribe to s1 only
    const ackPromise = nextMessage(ws);
    ws.send(JSON.stringify({ action: "subscribe", sessionId: "s1" }));
    await ackPromise;

    // Publish to s2 — should not receive it
    const received: any[] = [];
    ws.on("message", (data) => {
      received.push(JSON.parse(data.toString()));
    });

    eventBus.publish({
      sessionId: "s2",
      event: "other:event",
      timestamp: 2000,
    });

    // Give it a moment to make sure nothing arrives
    await new Promise((r) => setTimeout(r, 100));
    expect(received).toHaveLength(0);
  });

  it("new subscription replaces old one (strictly exclusive)", async () => {
    const port = await startAndGetPort();
    const ws = await connectWs(port);
    clients.push(ws);

    // Subscribe to s1
    const ack1Promise = nextMessage(ws);
    ws.send(JSON.stringify({ action: "subscribe", sessionId: "s1" }));
    await ack1Promise;

    // Subscribe to s2 (replaces s1)
    const ack2Promise = nextMessage(ws);
    ws.send(JSON.stringify({ action: "subscribe", sessionId: "s2" }));
    await ack2Promise;

    // Publish to s1 — should NOT receive (old subscription cleared)
    const received: any[] = [];
    ws.on("message", (data) => {
      received.push(JSON.parse(data.toString()));
    });

    eventBus.publish({
      sessionId: "s1",
      event: "event:old",
      timestamp: 100,
    });

    // Publish to s2 — should receive
    const msgPromise = nextMessage(ws);
    eventBus.publish({
      sessionId: "s2",
      event: "event:new",
      timestamp: 200,
    });
    const msg = await msgPromise;
    expect(msg.event).toBe("event:new");

    // Verify s1 event was not received
    await new Promise((r) => setTimeout(r, 100));
    const s1Events = received.filter((m) => m.event === "event:old");
    expect(s1Events).toHaveLength(0);
  });

  it("switching from session to global subscription works", async () => {
    const port = await startAndGetPort();
    const ws = await connectWs(port);
    clients.push(ws);

    // Subscribe to s1
    const ack1Promise = nextMessage(ws);
    ws.send(JSON.stringify({ action: "subscribe", sessionId: "s1" }));
    await ack1Promise;

    // Switch to global subscription
    const ack2Promise = nextMessage(ws);
    ws.send(JSON.stringify({ action: "subscribe" }));
    await ack2Promise;

    // Now should receive events from any session
    const msg1Promise = nextMessage(ws);
    eventBus.publish({
      sessionId: "s2",
      event: "event:any",
      timestamp: 100,
    });
    const msg1 = await msg1Promise;
    expect(msg1.event).toBe("event:any");
  });

  it("responds to unsubscribe action", async () => {
    const port = await startAndGetPort();
    const ws = await connectWs(port);
    clients.push(ws);

    const ackPromise = nextMessage(ws);
    ws.send(JSON.stringify({ action: "unsubscribe", sessionId: "s1" }));

    const ack = await ackPromise;
    expect(ack).toEqual({ action: "unsubscribed", sessionId: null });
  });

  it("sends error for invalid JSON", async () => {
    const port = await startAndGetPort();
    const ws = await connectWs(port);
    clients.push(ws);

    const errPromise = nextMessage(ws);
    ws.send("not-json{{{");

    const err = await errPromise;
    expect(err.error).toBe("Invalid JSON");
  });
});

describe("EventBus", () => {
  it("notifies session-specific subscribers", () => {
    const bus = new EventBus();
    const received: StoreEvent[] = [];
    bus.subscribe("s1", (e) => received.push(e));

    bus.publish({ sessionId: "s1", event: "a", timestamp: 1 });
    bus.publish({ sessionId: "s2", event: "b", timestamp: 2 });

    expect(received).toHaveLength(1);
    expect(received[0].event).toBe("a");
  });

  it("notifies global subscribers", () => {
    const bus = new EventBus();
    const received: StoreEvent[] = [];
    bus.subscribeAll((e) => received.push(e));

    bus.publish({ sessionId: "s1", event: "a", timestamp: 1 });
    bus.publish({ sessionId: "s2", event: "b", timestamp: 2 });

    expect(received).toHaveLength(2);
  });

  it("unsubscribes correctly", () => {
    const bus = new EventBus();
    const received: StoreEvent[] = [];
    const unsub = bus.subscribe("s1", (e) => received.push(e));

    bus.publish({ sessionId: "s1", event: "a", timestamp: 1 });
    unsub();
    bus.publish({ sessionId: "s1", event: "b", timestamp: 2 });

    expect(received).toHaveLength(1);
  });

  it("appends events to the EventLog", () => {
    const eventLog = new InMemoryEventLog();
    const bus = new EventBus(eventLog);

    bus.publish({ sessionId: "s1", event: "a", timestamp: 1 });
    bus.publish({ sessionId: "s1", event: "b", timestamp: 2 });

    const events = eventLog.queryEvents("s1");
    expect(events).toHaveLength(2);
    expect(events[0].event).toBe("a");
    expect(events[1].event).toBe("b");
  });
});
