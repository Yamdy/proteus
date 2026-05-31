import { useCallback, useState } from "react";
import { useSessionStore, type Session } from "../stores/sessionStore";
import { apiFetch } from "../lib/api";

const API_BASE = "/api/sessions";

export function useSession() {
  const {
    sessions,
    currentSession,
    setSessions,
    addSession,
    removeSession,
    setCurrentSession,
  } = useSessionStore();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSessions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<Session[]>(API_BASE);
      setSessions(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      console.error("fetchSessions error:", err);
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [setSessions]);

  const createSession = useCallback(
    async (name?: string) => {
      setLoading(true);
      setError(null);
      try {
        const session = await apiFetch<Session>(API_BASE, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        });
        addSession(session);
        setCurrentSession(session);
        return session;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        console.error("createSession error:", err);
        setError(msg);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [addSession, setCurrentSession],
  );

  const deleteSession = useCallback(
    async (id: string) => {
      setLoading(true);
      setError(null);
      try {
        await apiFetch(`${API_BASE}/${id}`, { method: "DELETE" });
        removeSession(id);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        console.error("deleteSession error:", err);
        setError(msg);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [removeSession],
  );

  return {
    sessions,
    currentSession,
    loading,
    error,
    fetchSessions,
    createSession,
    deleteSession,
    setCurrentSession,
  };
}
