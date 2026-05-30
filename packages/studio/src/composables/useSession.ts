import { useSessionStore } from "../stores/sessionStore";
import type { Session } from "../stores/sessionStore";

export function useSession() {
  const store = useSessionStore();

  async function fetchSessions(): Promise<void> {
    try {
      const res = await fetch("/api/sessions");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: Session[] = await res.json();

      // Sync fetched sessions into the store
      store.sessions = data;

      // Auto-select the first session if none is active
      if (!store.activeSessionId && data.length > 0) {
        store.activeSessionId = data[0].id;
      }
    } catch (err) {
      console.error("[useSession] fetchSessions failed:", err);
    }
  }

  async function createSession(label?: string): Promise<Session | null> {
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: label ?? "New Session" }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const session: Session = await res.json();

      store.addSession(session);
      return session;
    } catch (err) {
      console.error("[useSession] createSession failed:", err);
      return null;
    }
  }

  async function deleteSession(id: string): Promise<boolean> {
    try {
      const res = await fetch(`/api/sessions/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      store.removeSession(id);
      return true;
    } catch (err) {
      console.error("[useSession] deleteSession failed:", err);
      return false;
    }
  }

  return {
    fetchSessions,
    createSession,
    deleteSession,
  };
}
