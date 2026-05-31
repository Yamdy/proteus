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

  useEffect(() => {
    subscribeToEvents();
    fetchTraces({ limit: 50 });
  }, [subscribeToEvents, fetchTraces]);

  useEffect(() => {
    if (selectedTraceId) {
      fetchToolCalls(selectedTraceId);
    }
  }, [selectedTraceId, fetchToolCalls]);

  return (
    <div data-testid="observability-page" className="flex h-full flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between border-b border-white/[0.04] px-6 py-5">
        <div>
          <h1 className="text-lg font-bold text-gray-100 text-glow-subtle">
            Observability
          </h1>
          <p className="text-xs text-gray-600">
            Real-time phase timeline, traces, and tool call details
          </p>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-1 border-b border-white/[0.04] px-6">
        {(["phases", "traces", "tools"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            data-testid={`obs-tab-${t}`}
            className={`relative border-b-2 px-4 py-2.5 text-xs font-medium transition-all duration-200 ${
              tab === t
                ? "border-cyan-400/60 text-cyan-100"
                : "border-transparent text-gray-600 hover:text-gray-400"
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
        <div className="border-b border-red-500/20 bg-red-500/5 px-6 py-2 text-xs text-red-400">
          {error}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {tab === "phases" && (
          <PhaseTimeline
            events={phaseEvents}
            wsConnected={wsConnected}
            onClear={clearPhaseEvents}
          />
        )}

        {tab === "traces" && (
          <div className="flex h-full">
            {/* Trace list */}
            <div className="w-80 flex-shrink-0 glass-panel-strong overflow-y-auto">
              {loading && traces.length === 0 && (
                <div className="flex h-32 items-center justify-center">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-cyan-500/20 border-t-cyan-400" />
                </div>
              )}
              {traces.length === 0 && !loading && (
                <div className="flex h-full items-center justify-center text-sm text-gray-600">
                  No traces recorded yet
                </div>
              )}
              {traces.map((trace) => (
                <button
                  key={trace.traceId}
                  onClick={() => setSelectedTraceId(trace.traceId)}
                  className={`flex w-full flex-col gap-1 border-b border-white/[0.02] px-4 py-3 text-left transition-all duration-200 ${
                    selectedTraceId === trace.traceId
                      ? "bg-cyan-500/[0.06]"
                      : "hover:bg-white/[0.02]"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-block h-2 w-2 rounded-full ${
                        trace.status === "error"
                          ? "bg-red-500 shadow-[0_0_4px_rgba(239,68,68,0.4)]"
                          : trace.status === "ok"
                            ? "bg-emerald-400 shadow-[0_0_4px_rgba(52,211,153,0.4)]"
                            : "bg-gray-600"
                      }`}
                    />
                    <span className="font-mono text-xs text-gray-300">
                      {trace.traceId.slice(0, 16)}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-[10px] text-gray-600 font-mono">
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
                <div className="space-y-3 animate-fade-in">
                  <h3 className="text-sm font-semibold text-gray-200">
                    Trace:{" "}
                    <span className="font-mono text-cyan-400/60">
                      {selectedTraceId.slice(0, 16)}
                    </span>
                  </h3>
                  {traces
                    .find((t) => t.traceId === selectedTraceId)
                    ?.spans.map((span) => (
                      <div
                        key={span.id}
                        className="glass-panel rounded-lg px-4 py-3"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-gray-200">
                            {span.name}
                          </span>
                          <span className="text-[10px] text-gray-600 font-mono">
                            {span.duration != null
                              ? `${span.duration}ms`
                              : "--"}
                          </span>
                        </div>
                        {span.attributes && (
                          <pre className="mt-2 overflow-x-auto rounded-lg bg-surface/80 border border-white/[0.04] p-2 text-[10px] text-gray-500 font-mono">
                            {JSON.stringify(span.attributes, null, 2)}
                          </pre>
                        )}
                      </div>
                    ))}
                </div>
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-gray-600">
                  Select a trace to view details
                </div>
              )}
            </div>
          </div>
        )}

        {tab === "tools" && (
          <div className="h-full overflow-y-auto p-4">
            {selectedTraceId ? (
              <div className="space-y-3 animate-fade-in">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-200">
                    Tool Calls for Trace:{" "}
                    <span className="font-mono text-cyan-400/60">
                      {selectedTraceId.slice(0, 16)}
                    </span>
                  </h3>
                  <span className="text-xs text-gray-600 font-mono">
                    {toolCalls.length} call
                    {toolCalls.length !== 1 ? "s" : ""}
                  </span>
                </div>
                {toolCalls.length === 0 && (
                  <div className="flex h-32 items-center justify-center text-sm text-gray-600">
                    No tool calls in this trace
                  </div>
                )}
                {toolCalls.map((tc) => (
                  <ToolCallCard key={tc.id} toolCall={tc} />
                ))}
              </div>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-gray-600">
                Select a trace from the Traces tab to view tool calls
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
