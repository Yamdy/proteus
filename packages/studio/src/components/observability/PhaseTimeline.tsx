import type { PhaseEvent, PhaseName } from "../../hooks/useObservability";

interface PhaseTimelineProps {
  events: PhaseEvent[];
  wsConnected: boolean;
  onClear: () => void;
}

const PHASE_ORDER: PhaseName[] = [
  "context_assembly",
  "llm_inference",
  "action_resolution",
  "tool_execution",
  "result_observation",
];

const PHASE_LABELS: Record<PhaseName, string> = {
  context_assembly: "Context Assembly",
  llm_inference: "LLM Inference",
  action_resolution: "Action Resolution",
  tool_execution: "Tool Execution",
  result_observation: "Result Observation",
};

const PHASE_COLORS: Record<PhaseName, string> = {
  context_assembly: "bg-blue-500",
  llm_inference: "bg-purple-500",
  action_resolution: "bg-amber-500",
  tool_execution: "bg-cyan-500",
  result_observation: "bg-green-500",
};

const STATUS_COLORS: Record<string, string> = {
  started: "border-yellow-500 bg-yellow-500/10",
  completed: "border-green-500 bg-green-500/10",
  error: "border-red-500 bg-red-500/10",
};

function formatDuration(ms?: number): string {
  if (ms == null) return "--";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/**
 * Groups phase events by traceId to show per-turn timelines.
 */
function groupByTrace(events: PhaseEvent[]): Map<string, PhaseEvent[]> {
  const groups = new Map<string, PhaseEvent[]>();
  for (const event of events) {
    const existing = groups.get(event.traceId) ?? [];
    existing.push(event);
    groups.set(event.traceId, existing);
  }
  return groups;
}

/**
 * Builds a phase pipeline visualization for a single trace.
 */
function TracePipeline({ events }: { events: PhaseEvent[] }) {
  // Build a map of phase -> latest event
  const phaseMap = new Map<PhaseName, PhaseEvent>();
  for (const event of events) {
    const existing = phaseMap.get(event.phase);
    if (!existing || event.timestamp > existing.timestamp) {
      phaseMap.set(event.phase, event);
    }
  }

  return (
    <div className="flex items-center gap-1">
      {PHASE_ORDER.map((phase) => {
        const event = phaseMap.get(phase);
        const color = PHASE_COLORS[phase];
        const statusClass = event ? STATUS_COLORS[event.status] ?? "" : "";
        const isActive = event?.status === "started";

        return (
          <div key={phase} className="flex items-center gap-1">
            <div
              className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-[10px] transition-all ${
                event
                  ? statusClass
                  : "border-gray-700 bg-gray-800/30 text-gray-600"
              } ${isActive ? "animate-pulse" : ""}`}
            >
              <span className={`inline-block h-1.5 w-1.5 rounded-full ${color}`} />
              <span className={event ? "text-gray-300" : "text-gray-600"}>
                {PHASE_LABELS[phase]}
              </span>
              {event?.duration != null && (
                <span className="text-gray-500">
                  {formatDuration(event.duration)}
                </span>
              )}
            </div>
            {/* Connector arrow */}
            {phase !== "result_observation" && (
              <svg
                className="h-3 w-3 text-gray-700"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function PhaseTimeline({
  events,
  wsConnected,
  onClear,
}: PhaseTimelineProps) {
  const grouped = groupByTrace(events);
  const traceIds = Array.from(grouped.keys());

  return (
    <div data-testid="phase-timeline" className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-800 px-4 py-3">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-white">Phase Timeline</h2>
          <div data-testid="ws-status" className="flex items-center gap-1.5">
            <span
              className={`inline-block h-2 w-2 rounded-full ${
                wsConnected ? "bg-green-500" : "bg-red-500"
              }`}
            />
            <span className="text-[10px] text-gray-500">
              {wsConnected ? "Live" : "Disconnected"}
            </span>
          </div>
        </div>
        <button
          onClick={onClear}
          className="rounded-md px-2 py-1 text-xs text-gray-400 transition-colors hover:bg-gray-800 hover:text-white"
        >
          Clear
        </button>
      </div>

      {/* Pipeline legend */}
      <div className="border-b border-gray-800 px-4 py-2">
        <div className="flex flex-wrap items-center gap-3 text-[10px]">
          <span className="text-gray-500">Phases:</span>
          {PHASE_ORDER.map((phase) => (
            <span key={phase} className="flex items-center gap-1">
              <span className={`inline-block h-1.5 w-1.5 rounded-full ${PHASE_COLORS[phase]}`} />
              <span className="text-gray-400">{PHASE_LABELS[phase]}</span>
            </span>
          ))}
        </div>
      </div>

      {/* Timeline entries */}
      <div className="flex-1 overflow-y-auto">
        {traceIds.length === 0 && (
          <div className="flex h-full items-center justify-center text-sm text-gray-500">
            {wsConnected
              ? "Waiting for phase events..."
              : "Connect to see real-time phase transitions"}
          </div>
        )}

        {traceIds.map((traceId) => {
          const traceEvents = grouped.get(traceId) ?? [];
          const latestEvent = traceEvents.reduce((a, b) =>
            a.timestamp > b.timestamp ? a : b,
          );
          const hasError = traceEvents.some((e) => e.status === "error");

          return (
            <div
              key={traceId}
              className={`border-b border-gray-800/50 px-4 py-3 ${
                hasError ? "bg-red-950/10" : ""
              }`}
            >
              {/* Trace header */}
              <div className="mb-2 flex items-center gap-3 text-[10px] text-gray-500">
                <span className="font-mono text-gray-400">
                  {traceId.slice(0, 12)}
                </span>
                {latestEvent.sessionId && (
                  <span>session: {latestEvent.sessionId.slice(0, 8)}</span>
                )}
                <span>{formatTime(latestEvent.timestamp)}</span>
              </div>

              {/* Phase pipeline */}
              <TracePipeline events={traceEvents} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
