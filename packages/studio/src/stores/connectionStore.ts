import { defineStore } from "pinia";
import { ref, computed } from "vue";

export type WsStatus = "connecting" | "connected" | "reconnecting" | "disconnected" | "error";

export interface WsPhaseEvent {
  type: "phase";
  sessionId: string;
  data: { phase: string; status: string; timestamp: number };
}

export interface WsToolCallEvent {
  type: "tool_call";
  sessionId: string;
  data: { tool: string; args?: unknown; timestamp: number };
}

export interface WsCostEvent {
  type: "cost";
  sessionId: string;
  data: { amount: number; currency: string; model?: string; timestamp: number };
}

export interface WsPongEvent {
  type: "pong";
}

export type WsEvent = WsPhaseEvent | WsToolCallEvent | WsCostEvent | WsPongEvent;

type EventHandler<T = unknown> = (event: T) => void;

export const useConnectionStore = defineStore("connection", () => {
  const status = ref<WsStatus>("disconnected");
  const lastError = ref<string | null>(null);
  const reconnectAttempt = ref(0);
  const lastMessageAt = ref<number | null>(null);
  const subscribedSessions = ref<Set<string>>(new Set());

  let ws: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let intentionalClose = false;

  // Event handler registries
  const phaseHandlers = new Set<EventHandler<WsPhaseEvent>>();
  const toolCallHandlers = new Set<EventHandler<WsToolCallEvent>>();
  const costHandlers = new Set<EventHandler<WsCostEvent>>();

  const isConnected = computed(() => status.value === "connected");

  function connect() {
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    intentionalClose = false;
    status.value = "connecting";
    lastError.value = null;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    try {
      ws = new WebSocket(wsUrl);

      ws.addEventListener("open", () => {
        status.value = "connected";
        reconnectAttempt.value = 0;
        lastError.value = null;
        startHeartbeat();

        // Re-subscribe to all sessions after reconnect
        for (const sessionId of subscribedSessions.value) {
          sendMessage({ action: "subscribe", sessionId });
        }
      });

      ws.addEventListener("message", (event) => {
        lastMessageAt.value = Date.now();
        dispatchEvent(event.data);
      });

      ws.addEventListener("close", () => {
        stopHeartbeat();
        if (!intentionalClose) {
          status.value = "reconnecting";
          scheduleReconnect();
        } else {
          status.value = "disconnected";
        }
      });

      ws.addEventListener("error", () => {
        status.value = "error";
        lastError.value = "WebSocket connection failed";
      });
    } catch (e) {
      status.value = "error";
      lastError.value = e instanceof Error ? e.message : "Connection failed";
      scheduleReconnect();
    }
  }

  function scheduleReconnect() {
    if (reconnectTimer) clearTimeout(reconnectTimer);
    // Exponential backoff: 1s, 2s, 4s, 8s, 16s, 30s cap
    const delay = Math.min(1000 * 2 ** reconnectAttempt.value, 30000);
    reconnectAttempt.value += 1;
    status.value = "reconnecting";
    reconnectTimer = setTimeout(() => connect(), delay);
  }

  function startHeartbeat() {
    stopHeartbeat();
    heartbeatTimer = setInterval(() => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        sendMessage({ action: "ping" });
      }
    }, 30_000);
  }

  function stopHeartbeat() {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  }

  function disconnect() {
    intentionalClose = true;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    stopHeartbeat();
    if (ws) {
      ws.close();
      ws = null;
    }
    status.value = "disconnected";
  }

  function sendMessage(payload: unknown) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
    }
  }

  function subscribe(sessionId: string) {
    subscribedSessions.value.add(sessionId);
    sendMessage({ action: "subscribe", sessionId });
  }

  function unsubscribe(sessionId: string) {
    subscribedSessions.value.delete(sessionId);
    sendMessage({ action: "unsubscribe", sessionId });
  }

  function dispatchEvent(raw: string) {
    let parsed: WsEvent;
    try {
      parsed = JSON.parse(raw) as WsEvent;
    } catch {
      return; // ignore malformed messages
    }

    switch (parsed.type) {
      case "phase":
        for (const handler of phaseHandlers) handler(parsed);
        break;
      case "tool_call":
        for (const handler of toolCallHandlers) handler(parsed);
        break;
      case "cost":
        for (const handler of costHandlers) handler(parsed);
        break;
      case "pong":
        // heartbeat ack — no-op
        break;
    }
  }

  function onPhase(handler: EventHandler<WsPhaseEvent>): () => void {
    phaseHandlers.add(handler);
    return () => phaseHandlers.delete(handler);
  }

  function onToolCall(handler: EventHandler<WsToolCallEvent>): () => void {
    toolCallHandlers.add(handler);
    return () => toolCallHandlers.delete(handler);
  }

  function onCostUpdate(handler: EventHandler<WsCostEvent>): () => void {
    costHandlers.add(handler);
    return () => costHandlers.delete(handler);
  }

  return {
    status,
    lastError,
    reconnectAttempt,
    lastMessageAt,
    subscribedSessions,
    isConnected,
    connect,
    disconnect,
    sendMessage,
    subscribe,
    unsubscribe,
    onPhase,
    onToolCall,
    onCostUpdate,
  };
});
