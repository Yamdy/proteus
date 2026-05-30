import { onUnmounted, watch } from "vue";
import { useConnectionStore, type WsPhaseEvent, type WsToolCallEvent, type WsCostEvent } from "../stores/connectionStore";

export interface UseWebSocketOptions {
  onPhase?: (event: WsPhaseEvent) => void;
  onToolCall?: (event: WsToolCallEvent) => void;
  onCostUpdate?: (event: WsCostEvent) => void;
  autoConnect?: boolean;
  sessionIds?: () => string | null;
}

/**
 * Composable that exposes the WebSocket connection with typed event handlers.
 *
 * Usage:
 *   const { status, isConnected, subscribe, unsubscribe } = useWebSocket({
 *     onPhase(e) { ... },
 *     sessionIds: () => sessionStore.activeSessionId,
 *   });
 */
export function useWebSocket(options: UseWebSocketOptions = {}) {
  const store = useConnectionStore();
  const cleanups: Array<() => void> = [];

  // Auto-connect on first use (default true)
  if (options.autoConnect !== false) {
    store.connect();
  }

  // Register event handlers
  if (options.onPhase) {
    cleanups.push(store.onPhase(options.onPhase));
  }
  if (options.onToolCall) {
    cleanups.push(store.onToolCall(options.onToolCall));
  }
  if (options.onCostUpdate) {
    cleanups.push(store.onCostUpdate(options.onCostUpdate));
  }

  // Auto-subscribe/unsubscribe when sessionIds changes
  let currentSubscribed: string | null = null;
  if (options.sessionIds) {
    const stopWatch = watch(
      options.sessionIds,
      (newId, oldId) => {
        if (oldId && oldId !== newId) {
          store.unsubscribe(oldId);
        }
        if (newId) {
          store.subscribe(newId);
          currentSubscribed = newId;
        }
      },
      { immediate: true },
    );
    cleanups.push(stopWatch);
  }

  // Cleanup on unmount
  onUnmounted(() => {
    for (const fn of cleanups) fn();
    if (currentSubscribed) {
      store.unsubscribe(currentSubscribed);
    }
  });

  return {
    status: store.status,
    isConnected: store.isConnected,
    lastError: store.lastError,
    reconnectAttempt: store.reconnectAttempt,
    lastMessageAt: store.lastMessageAt,
    connect: () => store.connect(),
    disconnect: () => store.disconnect(),
    subscribe: (id: string) => store.subscribe(id),
    unsubscribe: (id: string) => store.unsubscribe(id),
  };
}
