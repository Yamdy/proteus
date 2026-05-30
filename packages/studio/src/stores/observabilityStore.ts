import { defineStore } from "pinia";
import { ref, computed } from "vue";

export interface TracePhase {
  name: string;
  status: "pending" | "running" | "completed" | "error";
  startedAt?: number;
  endedAt?: number;
  durationMs?: number;
  error?: string;
}

export interface ToolCall {
  id: string;
  name: string;
  args?: unknown;
  result?: unknown;
  status: "pending" | "running" | "completed" | "error";
  startedAt: number;
  endedAt?: number;
  durationMs?: number;
  error?: string;
}

export interface Trace {
  id: string;
  sessionId: string;
  phases: TracePhase[];
  startedAt: number;
  endedAt?: number;
  totalDurationMs?: number;
  model?: string;
  tokenUsage?: { input: number; output: number };
  toolCalls?: ToolCall[];
}

export const useObservabilityStore = defineStore("observability", () => {
  const traces = ref<Trace[]>([]);
  const selectedTraceId = ref<string | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);

  const selectedTrace = computed(() =>
    traces.value.find((t) => t.id === selectedTraceId.value) ?? null,
  );

  const recentTraces = computed(() =>
    [...traces.value].sort((a, b) => b.startedAt - a.startedAt).slice(0, 50),
  );

  function selectTrace(id: string) {
    selectedTraceId.value = id;
  }

  function addTrace(trace: Trace) {
    traces.value.push(trace);
    // Keep only last 200 traces to avoid unbounded growth
    if (traces.value.length > 200) {
      traces.value = traces.value.slice(-200);
    }
  }

  function updateTracePhase(
    traceId: string,
    phaseName: string,
    update: Partial<TracePhase>,
  ) {
    const trace = traces.value.find((t) => t.id === traceId);
    if (!trace) return;
    const phase = trace.phases.find((p) => p.name === phaseName);
    if (phase) {
      Object.assign(phase, update);
    }
  }

  function completeTrace(traceId: string) {
    const trace = traces.value.find((t) => t.id === traceId);
    if (trace) {
      trace.endedAt = Date.now();
      trace.totalDurationMs = trace.endedAt - trace.startedAt;
    }
  }

  function addToolCall(traceId: string, toolCall: ToolCall) {
    const trace = traces.value.find((t) => t.id === traceId);
    if (!trace) return;
    if (!trace.toolCalls) trace.toolCalls = [];
    trace.toolCalls.push(toolCall);
  }

  function updateToolCall(traceId: string, toolCallId: string, update: Partial<ToolCall>) {
    const trace = traces.value.find((t) => t.id === traceId);
    if (!trace || !trace.toolCalls) return;
    const tc = trace.toolCalls.find((t) => t.id === toolCallId);
    if (tc) {
      Object.assign(tc, update);
    }
  }

  async function fetchTraces(sessionId?: string) {
    loading.value = true;
    error.value = null;
    try {
      const url = sessionId
        ? `/api/traces?sessionId=${sessionId}`
        : "/api/traces";
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      traces.value = await res.json();
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Failed to load traces";
    } finally {
      loading.value = false;
    }
  }

  return {
    traces,
    selectedTraceId,
    selectedTrace,
    recentTraces,
    loading,
    error,
    selectTrace,
    addTrace,
    updateTracePhase,
    completeTrace,
    addToolCall,
    updateToolCall,
    fetchTraces,
  };
});
