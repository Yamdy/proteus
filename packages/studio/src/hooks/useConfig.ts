import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../lib/api";

const API_BASE = "/api/config";

// --- Types ---

export interface LLMConfig {
  provider: string;
  model: string;
  temperature: number;
}

export interface ToolConfig {
  name: string;
  enabled: boolean;
  description?: string;
}

export interface Level0Config {
  llm: LLMConfig;
  tools: ToolConfig[];
  logLevel: "debug" | "info" | "warn" | "error";
  systemPrompt?: string;
}

export interface HandlerConfig {
  id: string;
  name: string;
  priority: number;
  enabled: boolean;
  description?: string;
  config?: Record<string, unknown>;
}

export interface Level1Config {
  handlers: HandlerConfig[];
}

export interface Level2Config {
  code: string;
  language: string;
}

export interface AgentConfig {
  level0: Level0Config;
  level1: Level1Config;
  level2: Level2Config;
}

// --- Hook ---

interface UseConfigReturn {
  config: AgentConfig | null;
  loading: boolean;
  error: string | null;
  fetchConfig: () => Promise<void>;
  updateConfig: (patch: Partial<AgentConfig>) => Promise<void>;
  updateLevel0: (config: Level0Config) => Promise<void>;
  updateLevel1: (config: Level1Config) => Promise<void>;
  updateLevel2: (code: string) => Promise<void>;
  saving: boolean;
}

export function useConfig(): UseConfigReturn {
  const [config, setConfig] = useState<AgentConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<AgentConfig>(API_BASE);
      setConfig(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  const updateConfig = useCallback(
    async (patch: Partial<AgentConfig>) => {
      if (!config) return;
      setSaving(true);
      setError(null);
      try {
        const data = await apiFetch<AgentConfig>(API_BASE, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...config, ...patch }),
        });
        setConfig(data);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        setError(msg);
        throw err;
      } finally {
        setSaving(false);
      }
    },
    [config],
  );

  // Backward-compatible wrappers
  const updateLevel0 = useCallback(
    async (level0: Level0Config) => updateConfig({ level0 }),
    [updateConfig],
  );

  const updateLevel1 = useCallback(
    async (level1: Level1Config) => updateConfig({ level1 }),
    [updateConfig],
  );

  const updateLevel2 = useCallback(
    async (code: string) => {
      if (!config) return;
      return updateConfig({ level2: { ...config.level2, code } });
    },
    [updateConfig, config],
  );

  // Auto-fetch on mount
  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  return {
    config,
    loading,
    error,
    fetchConfig,
    updateConfig,
    updateLevel0,
    updateLevel1,
    updateLevel2,
    saving,
  };
}
