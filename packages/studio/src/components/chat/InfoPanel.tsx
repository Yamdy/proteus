import { useEffect, useState } from "react";
import { useObservability } from "../../hooks/useObservability";
import { useConfig } from "../../hooks/useConfig";
import { useSelfModify } from "../../hooks/useSelfModify";
import PhaseTimeline from "../observability/PhaseTimeline";
import CostDashboard from "../observability/CostDashboard";

function CollapsibleSection({
  title,
  defaultOpen,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  return (
    <div className="border-b border-white/[0.04]">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-3 py-2 text-xs font-semibold text-gray-300 hover:text-gray-100 transition-colors"
      >
        {title}
        <svg
          className={`h-3 w-3 text-gray-600 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && <div className="max-h-64 overflow-y-auto">{children}</div>}
    </div>
  );
}

export default function InfoPanel() {
  return (
    <div
      data-testid="info-panel"
      className="flex h-full w-80 flex-col glass-panel-strong overflow-y-auto"
    >
      <CollapsibleSection title="Phase Timeline" defaultOpen={true}>
        <PhaseSection />
      </CollapsibleSection>
      <CollapsibleSection title="Configuration" defaultOpen={true}>
        <ConfigSection />
      </CollapsibleSection>
      <CollapsibleSection title="Costs">
        <CostsSection />
      </CollapsibleSection>
      <CollapsibleSection title="Self-Modify">
        <ModifySection />
      </CollapsibleSection>
    </div>
  );
}

function PhaseSection() {
  const {
    phaseEvents,
    wsConnected,
    subscribeToEvents,
    clearPhaseEvents,
    fetchTraces,
  } = useObservability();

  useEffect(() => {
    subscribeToEvents();
    fetchTraces({ limit: 20 });
  }, [subscribeToEvents, fetchTraces]);

  return (
    <PhaseTimeline
      events={phaseEvents}
      wsConnected={wsConnected}
      onClear={clearPhaseEvents}
    />
  );
}

function CostsSection() {
  const { costs, loading, fetchCosts } = useObservability();

  useEffect(() => {
    fetchCosts();
  }, [fetchCosts]);

  return (
    <CostDashboard
      costs={costs}
      loading={loading}
      onRefresh={() => fetchCosts()}
      onFilterSession={(sessionId) => {
        if (sessionId) {
          fetchCosts({ sessionId });
        } else {
          fetchCosts();
        }
      }}
    />
  );
}

function ConfigSection() {
  const { config, loading, error, saving } = useConfig();

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-cyan-500/20 border-t-cyan-400" />
      </div>
    );
  }

  if (error || !config) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-xs text-gray-600">{error ?? "No config"}</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto p-3 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-gray-300">Configuration</h3>
        {saving && (
          <span className="text-[10px] text-cyan-400 animate-pulse">
            Saving...
          </span>
        )}
      </div>

      {/* LLM section */}
      <div className="glass-panel rounded-lg p-3 space-y-2">
        <h4 className="text-[10px] uppercase tracking-wider text-gray-500">
          LLM
        </h4>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-gray-500">Provider</span>
            <span className="text-xs text-gray-300 font-mono">
              {config.level0.llm.provider}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-gray-500">Model</span>
            <span className="text-xs text-gray-300 font-mono">
              {config.level0.llm.model}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-gray-500">Temperature</span>
            <span className="text-xs text-gray-300 font-mono">
              {config.level0.llm.temperature}
            </span>
          </div>
        </div>
      </div>

      {/* Tools section */}
      <div className="glass-panel rounded-lg p-3 space-y-2">
        <h4 className="text-[10px] uppercase tracking-wider text-gray-500">
          Tools
        </h4>
        <div className="space-y-1">
          {config.level0.tools.length === 0 ? (
            <span className="text-[10px] text-gray-700">
              No tools configured
            </span>
          ) : (
            config.level0.tools.map((tool) => (
              <div
                key={tool.name}
                className="flex items-center justify-between"
              >
                <span className="text-[10px] text-gray-300 font-mono">
                  {tool.name}
                </span>
                <span
                  className={`text-[10px] ${tool.enabled ? "text-green-400/70" : "text-gray-600"}`}
                >
                  {tool.enabled ? "enabled" : "disabled"}
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Logging */}
      <div className="glass-panel rounded-lg p-3">
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-gray-500">Log Level</span>
          <span className="text-xs text-gray-300 font-mono">
            {config.level0.logLevel}
          </span>
        </div>
      </div>
    </div>
  );
}

function ModifySection() {
  const { history, loading, error, fetchHistory } = useSelfModify();

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-cyan-500/20 border-t-cyan-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-xs text-gray-600">{error}</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/[0.04]">
        <h3 className="text-xs font-semibold text-gray-300">
          Self-Modify History
        </h3>
        <span className="text-[10px] text-gray-600 font-mono">
          {history.length}
        </span>
      </div>

      {history.length === 0 ? (
        <div className="flex h-full items-center justify-center">
          <p className="text-xs text-gray-600">No modifications yet</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          {history.map((entry) => (
            <div
              key={entry.commitId}
              className="border-b border-white/[0.02] px-3 py-2.5 transition-colors hover:bg-white/[0.02]"
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-medium text-gray-200 truncate">
                  {entry.message}
                </span>
              </div>
              <div className="flex items-center gap-3 text-[10px] text-gray-600 font-mono">
                <span>{entry.commitId.slice(0, 7)}</span>
                <span>
                  {new Date(entry.timestamp).toLocaleDateString()}
                </span>
                <span
                  className={
                    entry.action === "register"
                      ? "text-green-400/60"
                      : entry.action === "unregister"
                        ? "text-red-400/60"
                        : "text-cyan-400/60"
                  }
                >
                  {entry.action}
                </span>
              </div>
              <div className="mt-1 text-[10px] text-gray-500 font-mono">
                handler: {entry.handlerName}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
