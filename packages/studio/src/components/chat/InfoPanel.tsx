import { useEffect, useState } from "react";
import { useObservability } from "../../hooks/useObservability";
import { useConfig } from "../../hooks/useConfig";
import { useSelfModify } from "../../hooks/useSelfModify";
import PhaseTimeline from "../observability/PhaseTimeline";
import CostDashboard from "../observability/CostDashboard";

type InfoTab = "phase" | "costs" | "config" | "modify";

const TABS: { id: InfoTab; label: string; icon: string }[] = [
  { id: "phase", label: "Phase", icon: "◈" },
  { id: "costs", label: "Costs", icon: "◈" },
  { id: "config", label: "Config", icon: "◈" },
  { id: "modify", label: "Modify", icon: "◈" },
];

export default function InfoPanel() {
  const [tab, setTab] = useState<InfoTab>("phase");

  return (
    <div data-testid="info-panel" className="flex h-full w-80 flex-col glass-panel-strong">
      {/* Tab bar */}
      <div className="flex border-b border-white/[0.04]">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            data-testid={`info-tab-${t.id}`}
            className={`flex-1 py-2 text-[10px] font-medium transition-all duration-200 ${
              tab === t.id
                ? "text-cyan-300 border-b border-cyan-400/60"
                : "text-gray-600 hover:text-gray-400"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {tab === "phase" && <PhaseSection />}
        {tab === "costs" && <CostsSection />}
        {tab === "config" && <ConfigSection />}
        {tab === "modify" && <ModifySection />}
      </div>
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
          <span className="text-[10px] text-cyan-400 animate-pulse">Saving...</span>
        )}
      </div>

      {/* LLM section */}
      <div className="glass-panel rounded-lg p-3 space-y-2">
        <h4 className="text-[10px] uppercase tracking-wider text-gray-500">LLM</h4>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-gray-500">Provider</span>
            <span className="text-xs text-gray-300 font-mono">{config.level0.llm.provider}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-gray-500">Model</span>
            <span className="text-xs text-gray-300 font-mono">{config.level0.llm.model}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-gray-500">Temperature</span>
            <span className="text-xs text-gray-300 font-mono">{config.level0.llm.temperature}</span>
          </div>
        </div>
      </div>

      {/* Tools section */}
      <div className="glass-panel rounded-lg p-3 space-y-2">
        <h4 className="text-[10px] uppercase tracking-wider text-gray-500">Tools</h4>
        <div className="space-y-1">
          {config.level0.tools.length === 0 ? (
            <span className="text-[10px] text-gray-700">No tools configured</span>
          ) : (
            config.level0.tools.map((tool) => (
              <div key={tool.name} className="flex items-center justify-between">
                <span className="text-[10px] text-gray-300 font-mono">{tool.name}</span>
                <span className={`text-[10px] ${tool.enabled ? "text-green-400/70" : "text-gray-600"}`}>
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
          <span className="text-xs text-gray-300 font-mono">{config.level0.logLevel}</span>
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
        <h3 className="text-xs font-semibold text-gray-300">Self-Modify History</h3>
        <span className="text-[10px] text-gray-600 font-mono">{history.length}</span>
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
                <span>{new Date(entry.timestamp).toLocaleDateString()}</span>
                <span className={entry.action === "register" ? "text-green-400/60" : entry.action === "unregister" ? "text-red-400/60" : "text-cyan-400/60"}>
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
