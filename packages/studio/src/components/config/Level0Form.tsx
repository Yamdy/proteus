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
  const [systemPrompt, setSystemPrompt] = useState(config.systemPrompt ?? "");
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setLlm(config.llm);
    setTools(config.tools);
    setLogLevel(config.logLevel);
    setSystemPrompt(config.systemPrompt ?? "");
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
    await onSave({ llm, tools, logLevel, systemPrompt });
    setDirty(false);
  };

  const handleReset = () => {
    setLlm(config.llm);
    setTools(config.tools);
    setLogLevel(config.logLevel);
    setSystemPrompt(config.systemPrompt ?? "");
    setDirty(false);
  };

  return (
    <div data-testid="level0-form" className="flex flex-col gap-8 animate-fade-in">
      {/* LLM Configuration */}
      <section>
        <h3 className="mb-4 text-[11px] font-semibold uppercase tracking-[0.15em] text-cyan-500/50">
          LLM Configuration
        </h3>
        <div className="grid gap-4 sm:grid-cols-3">
          {/* Provider */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-500">
              Provider
            </label>
            <select
              value={llm.provider}
              onChange={(e) => handleLlmChange("provider", e.target.value)}
              data-testid="provider-select"
              className="w-full rounded-lg border border-white/[0.06] bg-surface-50/80 px-3 py-2.5 text-sm text-gray-100 outline-none transition-all duration-200 focus:border-cyan-500/30 focus:shadow-[0_0_8px_rgba(34,211,238,0.06)]"
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
            <label className="mb-1.5 block text-xs font-medium text-gray-500">
              Model
            </label>
            <input
              type="text"
              value={llm.model}
              onChange={(e) => handleLlmChange("model", e.target.value)}
              placeholder="e.g. gpt-4o, claude-3.5-sonnet"
              data-testid="model-input"
              className="w-full rounded-lg border border-white/[0.06] bg-surface-50/80 px-3 py-2.5 text-sm text-gray-100 placeholder-gray-700 outline-none transition-all duration-200 focus:border-cyan-500/30 focus:shadow-[0_0_8px_rgba(34,211,238,0.06)]"
            />
          </div>

          {/* Temperature */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-500">
              Temperature{" "}
              <span className="font-mono text-cyan-400/60">
                {llm.temperature.toFixed(2)}
              </span>
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
              className="w-full accent-cyan-500"
            />
            <div className="flex justify-between text-[10px] text-gray-700">
              <span>0 (precise)</span>
              <span>2 (creative)</span>
            </div>
          </div>
        </div>
      </section>

      {/* Tools */}
      <section>
        <h3 className="mb-4 text-[11px] font-semibold uppercase tracking-[0.15em] text-cyan-500/50">
          Tools
        </h3>
        {tools.length === 0 ? (
          <p className="text-sm text-gray-700">No tools registered.</p>
        ) : (
          <div className="space-y-2">
            {tools.map((tool, index) => (
              <div
                key={tool.name}
                className="flex items-center justify-between rounded-lg border border-white/[0.04] bg-surface-50/40 px-4 py-3 transition-all duration-200 hover:border-white/[0.08]"
              >
                <div>
                  <span className="text-sm font-medium text-gray-200">
                    {tool.name}
                  </span>
                  {tool.description && (
                    <p className="text-xs text-gray-600">{tool.description}</p>
                  )}
                </div>
                <button
                  onClick={() => handleToolToggle(index)}
                  className={`relative h-6 w-11 rounded-full transition-all duration-300 ${
                    tool.enabled
                      ? "bg-gradient-to-r from-cyan-600 to-teal-600 shadow-glow-sm"
                      : "bg-surface-300"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-300 ${
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
        <h3 className="mb-4 text-[11px] font-semibold uppercase tracking-[0.15em] text-cyan-500/50">
          Log Level
        </h3>
        <div className="flex gap-2">
          {LOG_LEVELS.map((level) => (
            <button
              key={level}
              onClick={() => handleLogLevelChange(level)}
              data-testid={`log-level-${level}`}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-all duration-200 ${
                logLevel === level
                  ? "bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 shadow-glow-sm"
                  : "border border-white/[0.06] bg-surface-50/40 text-gray-500 hover:border-white/[0.12] hover:text-gray-300"
              }`}
            >
              {level}
            </button>
          ))}
        </div>
      </section>

      {/* System Prompt */}
      <section>
        <h3 className="mb-4 text-[11px] font-semibold uppercase tracking-[0.15em] text-cyan-500/50">
          System Prompt
        </h3>
        <textarea
          value={systemPrompt}
          onChange={(e) => {
            setSystemPrompt(e.target.value);
            setDirty(true);
          }}
          rows={6}
          data-testid="system-prompt-input"
          className="w-full resize-none rounded-lg border border-white/[0.06] bg-surface-50/80 px-4 py-3 text-sm text-gray-100 placeholder-gray-600 outline-none transition-all duration-200 focus:border-cyan-500/30 focus:shadow-[0_0_12px_rgba(34,211,238,0.08)]"
          placeholder="Enter system prompt..."
        />
      </section>

      {/* Actions */}
      <div className="flex gap-3 border-t border-white/[0.04] pt-6">
        <button
          onClick={handleSave}
          disabled={!dirty || saving}
          data-testid="save-btn"
          className="rounded-lg bg-gradient-to-r from-cyan-600 to-teal-600 px-5 py-2.5 text-sm font-medium text-white shadow-glow-sm transition-all duration-200 hover:shadow-glow disabled:cursor-not-allowed disabled:opacity-30 disabled:shadow-none"
        >
          {saving ? "Saving..." : "Save Changes"}
        </button>
        <button
          onClick={handleReset}
          disabled={!dirty || saving}
          className="rounded-lg border border-white/[0.06] px-5 py-2.5 text-sm font-medium text-gray-500 transition-all duration-200 hover:border-white/[0.12] hover:text-gray-300 disabled:cursor-not-allowed disabled:opacity-30"
        >
          Reset
        </button>
      </div>
    </div>
  );
}
