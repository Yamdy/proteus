import { defineStore } from "pinia";
import { ref, computed } from "vue";

export interface SelfModifyEntry {
  id: string;
  sessionId: string;
  action: "register" | "replace" | "unregister";
  handlerName: string;
  description: string;
  timestamp: number;
  diff?: DiffBlock[];
  snapshotId?: number;
  trust?: number;
  status: "success" | "rolled_back" | "error";
  error?: string;
}

export interface DiffBlock {
  type: "add" | "remove" | "context";
  content: string;
  oldLine?: number;
  newLine?: number;
}

export type FilterAction = "all" | "register" | "replace" | "unregister";
export type FilterTime = "all" | "1h" | "24h" | "7d";

export const useSelfModifyStore = defineStore("selfModify", () => {
  const entries = ref<SelfModifyEntry[]>([]);
  const selectedEntryId = ref<string | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const filterAction = ref<FilterAction>("all");
  const filterTime = ref<FilterTime>("all");
  const searchQuery = ref("");
  const rollingBack = ref<string | null>(null);

  const selectedEntry = computed(() =>
    entries.value.find((e) => e.id === selectedEntryId.value) ?? null,
  );

  const filteredEntries = computed(() => {
    let result = [...entries.value];

    // Filter by action
    if (filterAction.value !== "all") {
      result = result.filter((e) => e.action === filterAction.value);
    }

    // Filter by time
    if (filterTime.value !== "all") {
      const now = Date.now();
      const cutoffs: Record<string, number> = {
        "1h": 60 * 60 * 1000,
        "24h": 24 * 60 * 60 * 1000,
        "7d": 7 * 24 * 60 * 60 * 1000,
      };
      const cutoff = cutoffs[filterTime.value];
      if (cutoff) {
        result = result.filter((e) => now - e.timestamp < cutoff);
      }
    }

    // Filter by search query
    if (searchQuery.value.trim()) {
      const q = searchQuery.value.toLowerCase();
      result = result.filter(
        (e) =>
          e.handlerName.toLowerCase().includes(q) ||
          e.description.toLowerCase().includes(q) ||
          e.action.toLowerCase().includes(q),
      );
    }

    // Sort by timestamp descending (most recent first)
    return result.sort((a, b) => b.timestamp - a.timestamp);
  });

  function selectEntry(id: string) {
    selectedEntryId.value = id;
  }

  async function fetchEntries(sessionId: string) {
    loading.value = true;
    error.value = null;
    try {
      const res = await fetch(`/api/traces/${sessionId}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      entries.value = Array.isArray(data) ? data : [];
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Failed to load history";
    } finally {
      loading.value = false;
    }
  }

  async function rollback(entryId: string): Promise<boolean> {
    const entry = entries.value.find((e) => e.id === entryId);
    if (!entry) return false;

    rollingBack.value = entryId;
    try {
      const res = await fetch(`/api/self-modify/rollback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: entry.sessionId,
          snapshotId: entry.snapshotId,
          handlerName: entry.handlerName,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      // Mark the entry as rolled back
      const idx = entries.value.findIndex((e) => e.id === entryId);
      if (idx !== -1) {
        entries.value[idx] = { ...entries.value[idx], status: "rolled_back" };
      }
      return true;
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Rollback failed";
      return false;
    } finally {
      rollingBack.value = null;
    }
  }

  // Generate a diff from snapshot data (for demo / when backend returns raw data)
  function generateDiff(oldContent: string, newContent: string): DiffBlock[] {
    const oldLines = oldContent.split("\n");
    const newLines = newContent.split("\n");
    const blocks: DiffBlock[] = [];
    const maxLen = Math.max(oldLines.length, newLines.length);

    for (let i = 0; i < maxLen; i++) {
      const oldLine = oldLines[i];
      const newLine = newLines[i];

      if (oldLine === undefined) {
        blocks.push({ type: "add", content: newLine, newLine: i + 1 });
      } else if (newLine === undefined) {
        blocks.push({ type: "remove", content: oldLine, oldLine: i + 1 });
      } else if (oldLine !== newLine) {
        blocks.push({ type: "remove", content: oldLine, oldLine: i + 1 });
        blocks.push({ type: "add", content: newLine, newLine: i + 1 });
      } else {
        blocks.push({
          type: "context",
          content: oldLine,
          oldLine: i + 1,
          newLine: i + 1,
        });
      }
    }

    return blocks;
  }

  return {
    entries,
    selectedEntryId,
    selectedEntry,
    filteredEntries,
    loading,
    error,
    filterAction,
    filterTime,
    searchQuery,
    rollingBack,
    selectEntry,
    fetchEntries,
    rollback,
    generateDiff,
  };
});
