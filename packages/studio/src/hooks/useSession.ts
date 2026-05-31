import { useCallback } from "react";
import { useSessionStore, type Session } from "../stores/sessionStore";

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

  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch(API_BASE);
      if (!res.ok) throw new Error(`Failed to fetch sessions: ${res.status}`);
      const data: Session[] = await res.json();
      setSessions(data);
    } catch (err) {
      console.error("fetchSessions error:", err);
      throw err;
    }
  }, [setSessions]);

  const createSession = useCallback(
    async (name?: string) => {
      try {
        const res = await fetch(API_BASE, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        });
        if (!res.ok) throw new Error(`Failed to create session: ${res.status}`);
        const session: Session = await res.json();
        addSession(session);
        setCurrentSession(session);
        return session;
      } catch (err) {
        console.error("createSession error:", err);
        throw err;
      }
    },
    [addSession, setCurrentSession],
  );

  const deleteSession = useCallback(
    async (id: string) => {
      try {
        const res = await fetch(`${API_BASE}/${id}`, { method: "DELETE" });
        if (!res.ok) throw new Error(`Failed to delete session: ${res.status}`);
        removeSession(id);
      } catch (err) {
        console.error("deleteSession error:", err);
        throw err;
      }
    },
    [removeSession],
  );

  return {
    sessions,
    currentSession,
    fetchSessions,
    createSession,
    deleteSession,
    setCurrentSession,
  };
}
