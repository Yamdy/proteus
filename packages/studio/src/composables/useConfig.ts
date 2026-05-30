import { computed } from "vue";
import { useConfigStore } from "../stores/configStore";
import type { Level0Config } from "../stores/configStore";

const AVAILABLE_MODELS = [
  "claude-sonnet-4-20250514",
  "claude-opus-4-20250514",
  "claude-haiku-35-20241022",
  "gpt-4o",
  "gpt-4o-mini",
  "gpt-4.1",
  "gemini-2.5-pro",
  "gemini-2.5-flash",
] as const;

const AVAILABLE_TOOLS = [
  "web_search",
  "code_execution",
  "file_read",
  "file_write",
  "memory_search",
  "memory_write",
  "browser",
  "shell",
  "database_query",
  "api_call",
] as const;

const LOG_LEVELS = ["debug", "info", "warn", "error"] as const;

type LogLevel = (typeof LOG_LEVELS)[number];

export interface Level0FormData {
  model: string;
  temperature: number;
  tools: string[];
  logLevel: LogLevel;
}

function defaults(): Level0FormData {
  return {
    model: "claude-sonnet-4-20250514",
    temperature: 0.7,
    tools: [],
    logLevel: "info",
  };
}

export function useConfig() {
  const store = useConfigStore();

  const loading = computed(() => store.loading);
  const error = computed(() => store.error);

  async function fetchConfig(): Promise<void> {
    await store.fetchConfig();
  }

  function parseLevel0(raw: Level0Config): Level0FormData {
    const h = raw.harness ?? {};
    const toolKeys = Object.keys(raw.tools ?? {}).filter(
      (k) => (raw.tools as Record<string, boolean>)[k],
    );
    return {
      model:
        typeof h.model === "string" ? h.model : defaults().model,
      temperature:
        typeof h.temperature === "number"
          ? h.temperature
          : defaults().temperature,
      tools: toolKeys.length > 0 ? toolKeys : defaults().tools,
      logLevel: isLogLevel(h.logLevel)
        ? h.logLevel
        : defaults().logLevel,
    };
  }

  async function saveLevel0(data: Level0FormData): Promise<boolean> {
    const toolsRecord: Record<string, boolean> = {};
    for (const t of AVAILABLE_TOOLS) {
      toolsRecord[t] = data.tools.includes(t);
    }

    const level0: Level0Config = {
      tools: toolsRecord,
      harness: {
        model: data.model,
        temperature: data.temperature,
        logLevel: data.logLevel,
      },
    };

    store.level0 = level0;
    await store.saveConfig();
    return store.error === null;
  }

  return {
    loading,
    error,
    fetchConfig,
    saveLevel0,
    parseLevel0,
    defaults,
    AVAILABLE_MODELS,
    AVAILABLE_TOOLS,
    LOG_LEVELS,
  };
}

function isLogLevel(v: unknown): v is LogLevel {
  return typeof v === "string" && (LOG_LEVELS as readonly string[]).includes(v);
}
