import { useState } from "react";
import { useConfig } from "../hooks/useConfig";
import Level0Form from "../components/config/Level0Form";
import Level1FlowEditor from "../components/config/Level1FlowEditor";
import Level2CodeEditor from "../components/config/Level2CodeEditor";

type ConfigTab = "level0" | "level1" | "level2";

const TABS: { id: ConfigTab; label: string; description: string }[] = [
  {
    id: "level0",
    label: "Level 0",
    description: "LLM, Tools & Logging",
  },
  {
    id: "level1",
    label: "Level 1",
    description: "Handler Pipeline",
  },
  {
    id: "level2",
    label: "Level 2",
    description: "Code Editor",
  },
];

export default function ConfigPage() {
  const [activeTab, setActiveTab] = useState<ConfigTab>("level0");
  const {
    config,
    loading,
    error,
    saving,
    updateLevel0,
    updateLevel1,
    updateLevel2,
    fetchConfig,
  } = useConfig();

  if (loading) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-cyan-500/20 border-t-cyan-400" />
        <p className="text-sm text-gray-500">Loading configuration...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-6 py-5 text-center">
          <p className="text-sm text-red-300">{error}</p>
          <button
            onClick={fetchConfig}
            className="mt-3 rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-1.5 text-xs font-medium text-red-300 transition-all hover:bg-red-500/20"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-gray-500">
        <p className="text-sm">No configuration available.</p>
      </div>
    );
  }

  return (
    <div data-testid="config-page" className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-white/[0.04] px-6 py-5">
        <h1 className="text-xl font-bold text-gray-100 text-glow-subtle">
          Configuration
        </h1>
        <p className="mt-1 text-xs text-gray-600">
          Manage agent configuration across three levels of abstraction
        </p>
      </div>

      {/* Tabs */}
      <div className="border-b border-white/[0.04] px-6">
        <div className="flex gap-0">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              data-testid={`config-tab-${tab.id}`}
              className={`relative px-5 py-3 text-sm font-medium transition-all duration-200 ${
                activeTab === tab.id
                  ? "text-cyan-100"
                  : "text-gray-600 hover:text-gray-400"
              }`}
            >
              <div className="flex items-center gap-2">
                <span>{tab.label}</span>
                <span className="text-[10px] text-gray-700">
                  {tab.description}
                </span>
              </div>
              {activeTab === tab.id && (
                <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-cyan-400/60 to-transparent" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        {activeTab === "level0" && (
          <Level0Form
            config={config.level0}
            saving={saving}
            onSave={updateLevel0}
          />
        )}

        {activeTab === "level1" && (
          <Level1FlowEditor
            config={config.level1}
            saving={saving}
            onSave={updateLevel1}
          />
        )}

        {activeTab === "level2" && (
          <Level2CodeEditor
            code={config.level2.code}
            language={config.level2.language}
            saving={saving}
            onSave={updateLevel2}
          />
        )}
      </div>
    </div>
  );
}
