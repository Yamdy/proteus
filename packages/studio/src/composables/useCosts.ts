import { ref, computed, onMounted } from "vue";
import { useWebSocket } from "./useWebSocket";
import type { WsCostEvent } from "../stores/connectionStore";

export interface CostEntry {
  id: string;
  sessionId: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  timestamp: number;
  turnIndex?: number;
  role?: string;
}

export interface SessionCostSummary {
  sessionId: string;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUsd: number;
  entries: CostEntry[];
  model: string;
  lastTimestamp: number;
}

export interface MetricsData {
  totalSessions: number;
  totalTokens: number;
  totalCostUsd: number;
  avgCostPerSession: number;
}

function formatUsd(amount: number): string {
  return `$${amount.toFixed(4)}`;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export function useCosts() {
  const costs = ref<CostEntry[]>([]);
  const sessionCosts = ref<CostEntry[]>([]);
  const metrics = ref<MetricsData | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const expandedSessionId = ref<string | null>(null);

  // Live cost events from WS
  const liveCostEvents = ref<WsCostEvent[]>([]);

  // Wire up WS cost updates
  const { isConnected } = useWebSocket({
    onCostUpdate(event) {
      liveCostEvents.value.push(event);
      // Keep last 100 live events
      if (liveCostEvents.value.length > 100) {
        liveCostEvents.value = liveCostEvents.value.slice(-100);
      }
    },
  });

  const totalCost = computed(() => costs.value.reduce((s, c) => s + c.costUsd, 0));
  const totalInputTokens = computed(() => costs.value.reduce((s, c) => s + c.inputTokens, 0));
  const totalOutputTokens = computed(() => costs.value.reduce((s, c) => s + c.outputTokens, 0));
  const totalSessions = computed(() => {
    const ids = new Set(costs.value.map((c) => c.sessionId));
    return ids.size;
  });

  const sessionSummaries = computed<SessionCostSummary[]>(() => {
    const map = new Map<string, CostEntry[]>();
    for (const entry of costs.value) {
      const arr = map.get(entry.sessionId) ?? [];
      arr.push(entry);
      map.set(entry.sessionId, arr);
    }
    const summaries: SessionCostSummary[] = [];
    for (const [sessionId, entries] of map) {
      entries.sort((a, b) => a.timestamp - b.timestamp);
      summaries.push({
        sessionId,
        totalInputTokens: entries.reduce((s, e) => s + e.inputTokens, 0),
        totalOutputTokens: entries.reduce((s, e) => s + e.outputTokens, 0),
        totalCostUsd: entries.reduce((s, e) => s + e.costUsd, 0),
        entries,
        model: entries[0]?.model ?? "unknown",
        lastTimestamp: Math.max(...entries.map((e) => e.timestamp)),
      });
    }
    summaries.sort((a, b) => b.lastTimestamp - a.lastTimestamp);
    return summaries;
  });

  const maxSessionCost = computed(() => {
    if (sessionSummaries.value.length === 0) return 1;
    return Math.max(...sessionSummaries.value.map((s) => s.totalCostUsd));
  });

  async function fetchCosts() {
    loading.value = true;
    error.value = null;
    try {
      const res = await fetch("/api/costs");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      costs.value = await res.json();
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Failed to load costs";
    } finally {
      loading.value = false;
    }
  }

  async function fetchSessionCosts(sessionId: string) {
    loading.value = true;
    error.value = null;
    try {
      const res = await fetch(`/api/costs/${sessionId}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      sessionCosts.value = await res.json();
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Failed to load session costs";
    } finally {
      loading.value = false;
    }
  }

  async function fetchMetrics() {
    try {
      const res = await fetch("/api/metrics");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      metrics.value = await res.json();
    } catch {
      // Metrics are optional — don't set error
    }
  }

  function toggleSession(sessionId: string) {
    expandedSessionId.value = expandedSessionId.value === sessionId ? null : sessionId;
  }

  onMounted(() => {
    fetchCosts();
    fetchMetrics();
  });

  return {
    costs,
    sessionCosts,
    metrics,
    loading,
    error,
    expandedSessionId,
    liveCostEvents,
    isConnected,
    totalCost,
    totalInputTokens,
    totalOutputTokens,
    totalSessions,
    sessionSummaries,
    maxSessionCost,
    fetchCosts,
    fetchSessionCosts,
    fetchMetrics,
    toggleSession,
    formatUsd,
    formatTokens,
  };
}
