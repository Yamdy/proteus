import { useEffect, useState } from "react";
import type { Level0Config, LLMConfig, ToolConfig } from "../../hooks/useConfig";

interface Level0FormProps {
  config: Level0Config;
  saving: boolean;
  onSave: (config: Level0Config) => Promise<void>;
}

const PROVIDERS = ["openai", "anthropic", "google", "azure", "ollama"];
const LOG_LEVELS = ["debug", "info", "warn", "error"] as const;

export default function Level0Form({ config, saving, onSave }: Level0FormProps) {
  const [llm, setLlm] = useState<LLMConfig>(config.llm);
  const [tools, setTools] = useState<ToolConfig[]>(config.tools);
  const [logLevel, setLogLevel] = useState(config.logLevel);
  const [dirty, setDirty] = useState(false);

  // Sync when external config changes
  useEffect(() => {
    setLlm(config.llm);
    setTools(config.tools);
    setLogLevel(config.logLevel);
    setDirty(false);
  }, [config]);

  const markDirty = () => setDirty(true);

  const handleLlmChange = (field: keyof LLMConfig, value: string | number) => {
    setLlm((prev) => ({ ...prev, [field]: value }));
    markDirty();
  };

  const handleToolToggle = (index: number) => {
    setTools((prev) =>
      prev.map((t, i) => (i === index ? { ...t, enabled: !t.enabled } : t)),
    );
    markDirty();
  };

  const handleLogLevelChange = (level: Level0Config["logLevel"]) => {
    setLogLevel(level);
    markDirty();
  };

  const handleSave = async () => {
    await onSave({ llm, tools, logLevel });
    setDirty(false);
  };

  const handleReset = () => {
    setLlm(config.llm);
    setTools(config.tools);
    setLogLevel(config.logLevel);
    setDirty(false);
  };

  return (
    <div data-testid="level0-form" className="flex flex-col gap-8">
      {/* LLM Configuration */}
      <section>
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-400">
          LLM Configuration
        </h3>
        <div className="grid gap-4 sm:grid-cols-3">
          {/* Provider */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-400">
              Provider
            </label>
            <select
              value={llm.provider}
              onChange={(e) => handleLlmChange("provider", e.target.value)}
              data-testid="provider-select"
              className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100 outline-none transition-colors focus:border-blue-600"
            >
              {PROVIDERS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>

          {/* Model */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-400">
              Model
            </label>
            <input
              type="text"
              value={llm.model}
              onChange={(e) => handleLlmChange("model", e.target.value)}
              placeholder="e.g. gpt-4o, claude-3.5-sonnet"
              data-testid="model-input"
              className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100 placeholder-gray-600 outline-none transition-colors focus:border-blue-600"
            />
          </div>

          {/* Temperature */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-400">
              Temperature ({llm.temperature.toFixed(2)})
            </label>
            <input
              type="range"
              min={0}
              max={2}
              step={0.01}
              value={llm.temperature}
              onChange={(e) =>
                handleLlmChange("temperature", parseFloat(e.target.value))
              }
              className="w-full accent-blue-600"
            />
            <div className="flex justify-between text-[10px] text-gray-600">
              <span>0 (precise)</span>
              <span>2 (creative)</span>
            </div>
          </div>
        </div>
      </section>

      {/* Tools */}
      <section>
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-400">
          Tools
        </h3>
        {tools.length === 0 ? (
          <p className="text-sm text-gray-600">No tools registered.</p>
        ) : (
          <div className="space-y-2">
            {tools.map((tool, index) => (
              <div
                key={tool.name}
                className="flex items-center justify-between rounded-lg border border-gray-800 bg-gray-900 px-4 py-3"
              >
                <div>
                  <span className="text-sm font-medium text-gray-200">
                    {tool.name}
                  </span>
                  {tool.description && (
                    <p className="text-xs text-gray-500">{tool.description}</p>
                  )}
                </div>
                <button
                  onClick={() => handleToolToggle(index)}
                  className={`relative h-6 w-11 rounded-full transition-colors ${
                    tool.enabled ? "bg-blue-600" : "bg-gray-700"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                      tool.enabled ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Log Level */}
      <section>
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-400">
          Log Level
        </h3>
        <div className="flex gap-2">
          {LOG_LEVELS.map((level) => (
            <button
              key={level}
              onClick={() => handleLogLevelChange(level)}
              data-testid={`log-level-${level}`}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                logLevel === level
                  ? "bg-blue-600 text-white"
                  : "border border-gray-700 bg-gray-900 text-gray-400 hover:border-gray-600 hover:text-gray-200"
              }`}
            >
              {level}
            </button>
          ))}
        </div>
      </section>

      {/* Actions */}
      <div className="flex gap-3 border-t border-gray-800 pt-6">
        <button
          onClick={handleSave}
          disabled={!dirty || saving}
          data-testid="save-btn"
          className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {saving ? "Saving..." : "Save Changes"}
        </button>
        <button
          onClick={handleReset}
          disabled={!dirty || saving}
          className="rounded-lg border border-gray-700 px-5 py-2 text-sm font-medium text-gray-400 transition-colors hover:border-gray-600 hover:text-gray-200 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Reset
        </button>
      </div>
    </div>
  );
}
