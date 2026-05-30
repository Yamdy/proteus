import { onUnmounted } from "vue";
import { useObservabilityStore, type Trace, type TracePhase, type ToolCall } from "../stores/observabilityStore";
import { useWebSocket } from "./useWebSocket";
import { useSessionStore } from "../stores/sessionStore";
import type { WsPhaseEvent, WsToolCallEvent } from "../stores/connectionStore";

// Phase name constants matching backend
const PHASE_CONTEXT_ASSEMBLY = "context_assembly";
const PHASE_LLM_INFERENCE = "llm_inference";
const PHASE_ACTION_RESOLUTION = "action_resolution";
const PHASE_TOOL_EXECUTION = "tool_execution";
const PHASE_RESULT_OBSERVATION = "result_observation";

const ALL_PHASES = [
  PHASE_CONTEXT_ASSEMBLY,
  PHASE_LLM_INFERENCE,
  PHASE_ACTION_RESOLUTION,
  PHASE_TOOL_EXECUTION,
  PHASE_RESULT_OBSERVATION,
];

// Track which trace is currently active per session (for WS event routing)
const activeTraceBySession = new Map<string, string>();

// Track tool call start times for duration calculation
const toolCallStartTimes = new Map<string, number>();

function generateId(): string {
  return `trace-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function generateToolCallId(): string {
  return `tc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Composable that bridges the observability store with real-time WebSocket
 * phase/tool_call events and the REST trace API.
 *
 * Usage:
 *   const { fetchTraces, traces, selectedTrace } = useTraces();
 */
export function useTraces() {
  const obsStore = useObservabilityStore();
  const sessionStore = useSessionStore();
  const activeSessionId = () => sessionStore.activeSessionId;

  // Wire WebSocket events to the observability store
  const { status, isConnected } = useWebSocket({
    autoConnect: false, // AppLayout already connects globally

    onPhase(event: WsPhaseEvent) {
      const { sessionId, data } = event;
      const { phase: phaseName, status: phaseStatus, timestamp } = data;

      let traceId = activeTraceBySession.get(sessionId);

      // If this is a new trace (context_assembly starting), create one
      if (phaseName === PHASE_CONTEXT_ASSEMBLY && phaseStatus === "running" && !traceId) {
        traceId = generateId();
        activeTraceBySession.set(sessionId, traceId);

        const newTrace: Trace = {
          id: traceId,
          sessionId,
          phases: ALL_PHASES.map((name) => ({
            name,
            status: name === PHASE_CONTEXT_ASSEMBLY ? "running" : "pending",
            ...(name === PHASE_CONTEXT_ASSEMBLY ? { startedAt: timestamp } : {}),
          })),
          startedAt: timestamp,
          toolCalls: [],
        };
        obsStore.addTrace(newTrace);
        obsStore.selectTrace(traceId);
      }

      if (!traceId) return;

      // Determine the partial update for the phase
      const partial: Partial<TracePhase> = {};
      if (phaseStatus === "running") {
        partial.status = "running";
        partial.startedAt = timestamp;
      } else if (phaseStatus === "completed") {
        partial.status = "completed";
        partial.endedAt = timestamp;
        if (partial.startedAt === undefined) {
          // Look up existing startedAt from store
          const existingTrace = obsStore.traces.find((t) => t.id === traceId);
          const existingPhase = existingTrace?.phases.find((p) => p.name === phaseName);
          if (existingPhase?.startedAt) {
            partial.durationMs = timestamp - existingPhase.startedAt;
          }
        } else {
          partial.durationMs = timestamp - partial.startedAt;
        }
      } else if (phaseStatus === "error") {
        partial.status = "error";
        partial.endedAt = timestamp;
        partial.error = "Phase error";
      }

      obsStore.updateTracePhase(traceId, phaseName, partial);

      // If result_observation completes, the entire trace is done
      if (phaseName === PHASE_RESULT_OBSERVATION && phaseStatus === "completed") {
        obsStore.completeTrace(traceId);
        activeTraceBySession.delete(sessionId);
      }

      // If a new phase starts, auto-start the next phase in sequence
      if (phaseStatus === "running") {
        const idx = ALL_PHASES.indexOf(phaseName);
        // Mark all previous phases as completed if they're still pending
        for (let i = 0; i < idx; i++) {
          const prevName = ALL_PHASES[i];
          const existingTrace = obsStore.traces.find((t) => t.id === traceId);
          const prevPhase = existingTrace?.phases.find((p) => p.name === prevName);
          if (prevPhase && prevPhase.status === "pending") {
            obsStore.updateTracePhase(traceId, prevName, {
              status: "completed",
              endedAt: timestamp,
              durationMs: 0,
            });
          }
        }
      }
    },

    onToolCall(event: WsToolCallEvent) {
      const { sessionId, data } = event;
      const traceId = activeTraceBySession.get(sessionId);
      if (!traceId) return;

      const toolCallId = generateToolCallId();
      const toolCall: ToolCall = {
        id: toolCallId,
        name: data.tool,
        args: data.args,
        status: "running",
        startedAt: data.timestamp,
      };

      toolCallStartTimes.set(toolCallId, data.timestamp);
      obsStore.addToolCall(traceId, toolCall);

      // Auto-complete tool calls after a brief delay since WS only sends start events.
      // In a real system the backend would send tool_call_result events.
      // For now, mark as completed after 2s as a reasonable default.
      setTimeout(() => {
        const endTime = Date.now();
        const startTime = toolCallStartTimes.get(toolCallId) ?? endTime;
        obsStore.updateToolCall(traceId, toolCallId, {
          status: "completed",
          endedAt: endTime,
          durationMs: endTime - startTime,
        });
        toolCallStartTimes.delete(toolCallId);
      }, 2000);
    },

    sessionIds: activeSessionId,
  });

  // Fetch traces from REST API
  async function fetchTraces(sessionId?: string): Promise<void> {
    await obsStore.fetchTraces(sessionId);
  }

  // Clean up on unmount
  onUnmounted(() => {
    // Nothing extra needed — useWebSocket handles its own cleanup
  });

  return {
    traces: obsStore.traces,
    selectedTrace: obsStore.selectedTrace,
    selectedTraceId: obsStore.selectedTraceId,
    recentTraces: obsStore.recentTraces,
    loading: obsStore.loading,
    error: obsStore.error,
    selectTrace: obsStore.selectTrace,
    fetchTraces,
    wsStatus: status,
    wsConnected: isConnected,
  };
}
