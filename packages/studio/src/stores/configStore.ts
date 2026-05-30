import { defineStore } from "pinia";
import { ref } from "vue";

/** Level 0: Static declarative config (tools, harness shape) */
export interface Level0Config {
  tools: Record<string, unknown>;
  harness: Record<string, unknown>;
}

/** Trust level for a handler */
export type TrustLevel = "low" | "medium" | "high";

/** A single handler node in the Level 1 pipeline */
export interface HandlerNode {
  id: string;
  name: string;
  priority: number;
  trust: TrustLevel;
  events: string[];
  promptTemplate: string;
  variableBindings: Record<string, string>;
}

/** Level 1: Runtime-tunable parameters (model, temperature, tokens) */
export interface Level1Config {
  model: string;
  temperature: number;
  maxTokens: number;
  systemPrompt: string;
  handlers: HandlerNode[];
}

/** Level 2: Prompt/strategy tweaks (few-shot examples, chain-of-thought) */
export interface Level2Config {
  fewShotExamples: Array<{ input: string; output: string }>;
  chainOfThoughtEnabled: boolean;
  customInstructions: string;
}

export const useConfigStore = defineStore("config", () => {
  const level0 = ref<Level0Config>({
    tools: {},
    harness: {},
  });

  const level1 = ref<Level1Config>({
    model: "claude-sonnet-4-20250514",
    temperature: 0.7,
    maxTokens: 4096,
    systemPrompt: "",
    handlers: [],
  });

  const level2 = ref<Level2Config>({
    fewShotExamples: [],
    chainOfThoughtEnabled: false,
    customInstructions: "",
  });

  const loading = ref(false);
  const error = ref<string | null>(null);
  const selectedHandlerId = ref<string | null>(null);

  async function fetchConfig() {
    loading.value = true;
    error.value = null;
    try {
      const res = await fetch("/api/config");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.level0) level0.value = data.level0;
      if (data.level1) level1.value = data.level1;
      if (data.level2) level2.value = data.level2;
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Failed to load config";
    } finally {
      loading.value = false;
    }
  }

  async function saveConfig() {
    loading.value = true;
    error.value = null;
    try {
      const res = await fetch("/api/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          level0: level0.value,
          level1: level1.value,
          level2: level2.value,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Failed to save config";
    } finally {
      loading.value = false;
    }
  }

  let nextHandlerId = 1;

  function addHandler(handler: Omit<HandlerNode, "id">) {
    level1.value.handlers.push({ ...handler, id: `handler-${nextHandlerId++}` });
    // Re-sort by priority descending
    level1.value.handlers.sort((a, b) => b.priority - a.priority);
  }

  function updateHandler(id: string, patch: Partial<Omit<HandlerNode, "id">>) {
    const idx = level1.value.handlers.findIndex((h) => h.id === id);
    if (idx === -1) return;
    level1.value.handlers[idx] = { ...level1.value.handlers[idx], ...patch };
    level1.value.handlers.sort((a, b) => b.priority - a.priority);
  }

  function removeHandler(id: string) {
    level1.value.handlers = level1.value.handlers.filter((h) => h.id !== id);
  }

  function selectHandler(id: string | null) {
    selectedHandlerId.value = id;
  }

  return {
    level0,
    level1,
    level2,
    loading,
    error,
    selectedHandlerId,
    fetchConfig,
    saveConfig,
    addHandler,
    updateHandler,
    removeHandler,
    selectHandler,
  };
});
