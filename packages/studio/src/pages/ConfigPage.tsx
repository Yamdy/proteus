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
      <div className="flex h-full flex-col items-center justify-center gap-3 text-gray-500">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-600 border-t-blue-500" />
        <p className="text-sm">Loading configuration...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 text-gray-500">
        <div className="rounded-lg border border-red-800 bg-red-950 px-6 py-4 text-center">
          <p className="text-sm text-red-300">{error}</p>
          <button
            onClick={fetchConfig}
            className="mt-3 rounded bg-red-800 px-4 py-1.5 text-xs font-medium text-red-200 hover:bg-red-700"
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
      <div className="border-b border-gray-800 px-6 py-4">
        <h1 className="text-xl font-bold text-white">Configuration</h1>
        <p className="mt-1 text-xs text-gray-500">
          Manage agent configuration across three levels of abstraction
        </p>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-800 px-6">
        <div className="flex gap-0">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              data-testid={`config-tab-${tab.id}`}
              className={`relative px-5 py-3 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? "text-white"
                  : "text-gray-500 hover:text-gray-300"
              }`}
            >
              <div className="flex items-center gap-2">
                <span>{tab.label}</span>
                <span className="text-[10px] text-gray-600">{tab.description}</span>
              </div>
              {/* Active indicator */}
              {activeTab === tab.id && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />
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
