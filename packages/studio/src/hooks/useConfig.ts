import { useCallback, useEffect, useState } from "react";

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
      const res = await fetch(API_BASE);
      if (!res.ok) {
        throw new Error(`Failed to fetch config: ${res.status}`);
      }
      const data: AgentConfig = await res.json();
      setConfig(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  const updateLevel0 = useCallback(
    async (level0: Level0Config) => {
      if (!config) return;
      setSaving(true);
      setError(null);
      try {
        const res = await fetch(API_BASE, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...config, level0 }),
        });
        if (!res.ok) {
          throw new Error(`Failed to update Level 0 config: ${res.status}`);
        }
        const data: AgentConfig = await res.json();
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

  const updateLevel1 = useCallback(
    async (level1: Level1Config) => {
      if (!config) return;
      setSaving(true);
      setError(null);
      try {
        const res = await fetch(API_BASE, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...config, level1 }),
        });
        if (!res.ok) {
          throw new Error(`Failed to update Level 1 config: ${res.status}`);
        }
        const data: AgentConfig = await res.json();
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

  const updateLevel2 = useCallback(
    async (code: string) => {
      if (!config) return;
      setSaving(true);
      setError(null);
      try {
        const res = await fetch(API_BASE, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...config, level2: { ...config.level2, code } }),
        });
        if (!res.ok) {
          throw new Error(`Failed to update Level 2 config: ${res.status}`);
        }
        const data: AgentConfig = await res.json();
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

  // Auto-fetch on mount
  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  return {
    config,
    loading,
    error,
    fetchConfig,
    updateLevel0,
    updateLevel1,
    updateLevel2,
    saving,
  };
}
