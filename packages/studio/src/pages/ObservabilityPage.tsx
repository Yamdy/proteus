import { useEffect, useState } from "react";
import { useObservability } from "../hooks/useObservability";
import PhaseTimeline from "../components/observability/PhaseTimeline";
import ToolCallCard from "../components/observability/ToolCallCard";

export default function ObservabilityPage() {
  const {
    traces,
    toolCalls,
    phaseEvents,
    loading,
    error,
    wsConnected,
    fetchTraces,
    fetchToolCalls,
    subscribeToEvents,
    clearPhaseEvents,
  } = useObservability();

  const [selectedTraceId, setSelectedTraceId] = useState<string | null>(null);
  const [tab, setTab] = useState<"phases" | "traces" | "tools">("phases");

  // Subscribe to WebSocket on mount
  useEffect(() => {
    subscribeToEvents();
    fetchTraces({ limit: 50 });
  }, [subscribeToEvents, fetchTraces]);

  // Fetch tool calls when a trace is selected
  useEffect(() => {
    if (selectedTraceId) {
      fetchToolCalls(selectedTraceId);
    }
  }, [selectedTraceId, fetchToolCalls]);

  return (
    <div data-testid="observability-page" className="flex h-full flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between border-b border-gray-800 px-6 py-4">
        <div>
          <h1 className="text-lg font-bold text-white">Observability</h1>
          <p className="text-xs text-gray-500">
            Real-time phase timeline, traces, and tool call details
          </p>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-1 border-b border-gray-800 px-6">
        {(["phases", "traces", "tools"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            data-testid={`obs-tab-${t}`}
            className={`border-b-2 px-4 py-2 text-xs font-medium transition-colors ${
              tab === t
                ? "border-white text-white"
                : "border-transparent text-gray-500 hover:text-gray-300"
            }`}
          >
            {t === "phases" && "Phase Timeline"}
            {t === "traces" && "Traces"}
            {t === "tools" && "Tool Calls"}
          </button>
        ))}
      </div>

      {/* Error banner */}
      {error && (
        <div className="border-b border-red-800 bg-red-950/30 px-6 py-2 text-xs text-red-400">
          {error}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {/* Phase Timeline tab */}
        {tab === "phases" && (
          <PhaseTimeline
            events={phaseEvents}
            wsConnected={wsConnected}
            onClear={clearPhaseEvents}
          />
        )}

        {/* Traces tab */}
        {tab === "traces" && (
          <div className="flex h-full">
            {/* Trace list */}
            <div className="w-80 flex-shrink-0 border-r border-gray-800 overflow-y-auto">
              {loading && traces.length === 0 && (
                <div className="flex h-32 items-center justify-center">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-600 border-t-white" />
                </div>
              )}
              {traces.length === 0 && !loading && (
                <div className="flex h-full items-center justify-center text-sm text-gray-500">
                  No traces recorded yet
                </div>
              )}
              {traces.map((trace) => (
                <button
                  key={trace.traceId}
                  onClick={() => setSelectedTraceId(trace.traceId)}
                  className={`flex w-full flex-col gap-1 border-b border-gray-800/50 px-4 py-3 text-left transition-colors ${
                    selectedTraceId === trace.traceId
                      ? "bg-gray-800"
                      : "hover:bg-gray-900"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-block h-2 w-2 rounded-full ${
                        trace.status === "error"
                          ? "bg-red-500"
                          : trace.status === "ok"
                            ? "bg-green-500"
                            : "bg-gray-500"
                      }`}
                    />
                    <span className="font-mono text-xs text-gray-300">
                      {trace.traceId.slice(0, 16)}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-[10px] text-gray-600">
                    <span>
                      {new Date(trace.startTime).toLocaleTimeString()}
                    </span>
                    {trace.duration != null && (
                      <span>{trace.duration}ms</span>
                    )}
                    <span>{trace.spans.length} spans</span>
                  </div>
                </button>
              ))}
            </div>

            {/* Trace detail */}
            <div className="flex-1 overflow-y-auto p-4">
              {selectedTraceId ? (
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-white">
                    Trace: <span className="font-mono">{selectedTraceId.slice(0, 16)}</span>
                  </h3>
                  {traces
                    .find((t) => t.traceId === selectedTraceId)
                    ?.spans.map((span) => (
                      <div
                        key={span.id}
                        className="rounded-lg border border-gray-800 bg-gray-900/50 px-4 py-3"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-white">
                            {span.name}
                          </span>
                          <span className="text-[10px] text-gray-500">
                            {span.duration != null ? `${span.duration}ms` : "--"}
                          </span>
                        </div>
                        {span.attributes && (
                          <pre className="mt-2 overflow-x-auto rounded bg-gray-950 p-2 text-[10px] text-gray-400">
                            {JSON.stringify(span.attributes, null, 2)}
                          </pre>
                        )}
                      </div>
                    ))}
                </div>
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-gray-500">
                  Select a trace to view details
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tool Calls tab */}
        {tab === "tools" && (
          <div className="h-full overflow-y-auto p-4">
            {selectedTraceId ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-white">
                    Tool Calls for Trace:{" "}
                    <span className="font-mono">{selectedTraceId.slice(0, 16)}</span>
                  </h3>
                  <span className="text-xs text-gray-500">
                    {toolCalls.length} call{toolCalls.length !== 1 ? "s" : ""}
                  </span>
                </div>
                {toolCalls.length === 0 && (
                  <div className="flex h-32 items-center justify-center text-sm text-gray-500">
                    No tool calls in this trace
                  </div>
                )}
                {toolCalls.map((tc) => (
                  <ToolCallCard key={tc.id} toolCall={tc} />
                ))}
              </div>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-gray-500">
                Select a trace from the Traces tab to view tool calls
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
