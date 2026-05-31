# Generator State -- Iteration 005

## What Was Built
- Enhanced `connectionStore` (`packages/studio/src/stores/connectionStore.ts`) with subscribe/unsubscribe actions, exponential backoff reconnect (1s-30s cap), heartbeat ping every 30s, typed event dispatching for phase/tool_call/cost WS messages, and handler registries (onPhase/onToolCall/onCostUpdate)
- `useWebSocket` composable (`packages/studio/src/composables/useWebSocket.ts`) -- wraps connectionStore with typed callbacks (onPhase, onToolCall, onCostUpdate), auto session subscribe/unsubscribe via reactive watch, cleanup on unmount
- `ConnectionIndicator` (`packages/studio/src/components/common/ConnectionIndicator.vue`) -- w-2 h-2 rounded-full dot: green=connected, yellow=reconnecting/connecting, red=error, gray=disconnected; animated ping pulse; hover tooltip showing status text and reconnect attempt count
- `EventToast` (`packages/studio/src/components/common/EventToast.vue`) -- toast notifications in fixed bottom-4 right-4 z-50 container; bg-gray-800 border-l-4 color-coded (blue=phase, violet=tool_call, amber=cost, red=error, gray=info); auto-dismiss 5s; slide-in/out animation; max 5 visible; dismiss button per toast
- `toastStore` (`packages/studio/src/stores/toastStore.ts`) -- manages toast lifecycle with auto-dismiss timers and max-visible cap of 5
- Wired into `AppLayout` (`packages/studio/src/components/layout/AppLayout.vue`) -- connects WS on mount, registers global toast handlers for all three event types (phase, tool_call, cost)
- Wired into `ChatView` (`packages/studio/src/views/ChatView.vue`) -- auto-subscribes/unsubscribes to active session via computed from sessionStore
- Updated `AppSidebar` (`packages/studio/src/components/layout/AppSidebar.vue`) -- replaced inline connection dot with ConnectionIndicator component

## What Changed This Iteration
- [Added: connectionStore subscribe/unsubscribe, heartbeat, typed event dispatch, "reconnecting" status]
- [Added: useWebSocket composable]
- [Added: ConnectionIndicator component]
- [Added: EventToast component with toastStore]
- [Wired: AppLayout connects + global toast handlers]
- [Wired: ChatView subscribes to active session]
- [Replaced: AppSidebar inline dot with ConnectionIndicator]

## Known Issues
- Two pre-existing vue-tsc errors in unrelated files (Level0Form.vue, SelfModifyHistory.vue)

## Dev Server
- URL: http://localhost:3000
- Status: build verified (vite build passes cleanly)
- Command: `cd packages/studio && npm run dev`
