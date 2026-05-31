import { useCallback, useEffect, useState } from "react";

const API_BASE = "/api/self-modify";

// --- Types ---

export interface ModifyHistoryEntry {
  commitId: string;
  message: string;
  timestamp: number;
  traceId?: string;
  action: "register" | "replace" | "unregister";
  handlerName: string;
  author?: string;
}

export interface ModifyDetail {
  commitId: string;
  message: string;
  timestamp: number;
  traceId?: string;
  action: "register" | "replace" | "unregister";
  handlerName: string;
  diff?: {
    before: string;
    after: string;
  };
  metadata?: Record<string, unknown>;
}

// --- Hook ---

interface UseSelfModifyReturn {
  history: ModifyHistoryEntry[];
  loading: boolean;
  error: string | null;
  selectedEntry: ModifyDetail | null;
  fetchHistory: () => Promise<void>;
  fetchDetail: (commitId: string) => Promise<void>;
  rollback: (commitId: string) => Promise<void>;
  rollingBack: boolean;
  clearSelection: () => void;
}

export function useSelfModify(): UseSelfModifyReturn {
  const [history, setHistory] = useState<ModifyHistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<ModifyDetail | null>(null);
  const [rollingBack, setRollingBack] = useState(false);

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(API_BASE);
      if (res.status === 404) {
        // Self-modify endpoint not available on this server — return empty
        setHistory([]);
        return;
      }
      if (!res.ok) {
        throw new Error(`Failed to fetch history: ${res.status}`);
      }
      const data: ModifyHistoryEntry[] = await res.json();
      setHistory(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchDetail = useCallback(async (commitId: string) => {
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/${commitId}`);
      if (res.status === 404) {
        setError("Self-modify endpoint not available on this server");
        return;
      }
      if (!res.ok) {
        throw new Error(`Failed to fetch detail: ${res.status}`);
      }
      const data: ModifyDetail = await res.json();
      setSelectedEntry(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setError(msg);
    }
  }, []);

  const rollback = useCallback(
    async (commitId: string) => {
      setRollingBack(true);
      setError(null);
      try {
        const res = await fetch(`${API_BASE}/rollback`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ commitId }),
        });
        if (res.status === 404) {
          const msg = "Self-modify endpoint not available on this server";
          setError(msg);
          throw new Error(msg);
        }
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(
            body?.message ?? `Rollback failed: ${res.status}`,
          );
        }
        // Refresh history after successful rollback
        await fetchHistory();
        setSelectedEntry(null);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        setError(msg);
        throw err;
      } finally {
        setRollingBack(false);
      }
    },
    [fetchHistory],
  );

  const clearSelection = useCallback(() => {
    setSelectedEntry(null);
  }, []);

  // Auto-fetch on mount
  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  return {
    history,
    loading,
    error,
    selectedEntry,
    fetchHistory,
    fetchDetail,
    rollback,
    rollingBack,
    clearSelection,
  };
}
