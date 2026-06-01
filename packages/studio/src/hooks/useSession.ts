import { useCallback, useState } from "react";
import { useSessionStore, type Session, type Thread } from "../stores/sessionStore";
import { apiFetch } from "../lib/api";

const API_BASE = "/api/sessions";

export function useSession() {
  const {
    sessions,
    currentSession,
    threads,
    currentThread,
    setSessions,
    addSession,
    removeSession,
    setCurrentSession,
    setThreads,
    addThread,
    removeThread,
    setCurrentThread,
    setMessages,
  } = useSessionStore();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [threadLoading, setThreadLoading] = useState(false);
  const [threadError, setThreadError] = useState<string | null>(null);

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

  const fetchMessages = useCallback(
    async (sessionId: string) => {
      try {
        const data = await apiFetch<Array<{ role: string; content: string }>>(
          `${API_BASE}/${sessionId}/messages`,
        );
        const messages = data.map((msg, i) => ({
          id: `hist-${sessionId}-${i}`,
          sessionId,
          role: msg.role as "user" | "assistant",
          content: msg.content,
          timestamp: Date.now() - (data.length - i) * 60000,
        }));
        setMessages(sessionId, messages);
      } catch (err: unknown) {
        console.error("fetchMessages error:", err);
      }
    },
    [setMessages],
  );

  // ── Thread operations ──────────────────────────────────────────────

  const THREAD_API = "/api/threads";

  const fetchThreads = useCallback(async () => {
    setThreadLoading(true);
    setThreadError(null);
    try {
      const data = await apiFetch<Thread[]>(THREAD_API);
      setThreads(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      console.error("fetchThreads error:", err);
      setThreadError(msg);
      throw err;
    } finally {
      setThreadLoading(false);
    }
  }, [setThreads]);

  const createThread = useCallback(
    async (name?: string) => {
      setThreadLoading(true);
      setThreadError(null);
      try {
        // Create a session on the server first (threads need a backing session for chat)
        const session = await apiFetch<Session>(API_BASE, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        });
        addSession(session);

        const thread = await apiFetch<Thread>(THREAD_API, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        });
        // Link thread to the session
        const threadWithSession = { ...thread, sessionId: session.id };
        addThread(threadWithSession);
        setCurrentThread(threadWithSession);
        return threadWithSession;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        console.error("createThread error:", err);
        setThreadError(msg);
        throw err;
      } finally {
        setThreadLoading(false);
      }
    },
    [addSession, addThread, setCurrentThread],
  );

  const deleteThread = useCallback(
    async (id: string) => {
      setThreadLoading(true);
      setThreadError(null);
      try {
        await apiFetch(`${THREAD_API}/${id}`, { method: "DELETE" });
        removeThread(id);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        console.error("deleteThread error:", err);
        setThreadError(msg);
        throw err;
      } finally {
        setThreadLoading(false);
      }
    },
    [removeThread],
  );

  const fetchThreadMessages = useCallback(
    async (threadId: string) => {
      try {
        const data = await apiFetch<Array<{ role: string; content: string }>>(
          `${THREAD_API}/${threadId}/messages`,
        );
        const messages = data.map((msg, i) => ({
          id: `thread-${threadId}-${i}`,
          sessionId: threadId,
          role: msg.role as "user" | "assistant",
          content: msg.content,
          timestamp: Date.now() - (data.length - i) * 60000,
        }));
        setMessages(threadId, messages);
      } catch (err: unknown) {
        console.error("fetchThreadMessages error:", err);
      }
    },
    [setMessages],
  );

  return {
    sessions,
    currentSession,
    loading,
    error,
    fetchSessions,
    createSession,
    deleteSession,
    fetchMessages,
    setCurrentSession,
    threads,
    currentThread,
    threadLoading,
    threadError,
    fetchThreads,
    createThread,
    deleteThread,
    fetchThreadMessages,
    setCurrentThread,
  };
}
