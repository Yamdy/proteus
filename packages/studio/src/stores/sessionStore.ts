import { defineStore } from "pinia";
import { ref, computed } from "vue";

export interface Session {
  id: string;
  label: string;
  createdAt: number;
  lastActivityAt: number;
  messageCount: number;
}

export const useSessionStore = defineStore("session", () => {
  const sessions = ref<Session[]>([]);
  const activeSessionId = ref<string | null>(null);

  const activeSession = computed(() =>
    sessions.value.find((s) => s.id === activeSessionId.value) ?? null,
  );

  const sortedSessions = computed(() =>
    [...sessions.value].sort((a, b) => b.lastActivityAt - a.lastActivityAt),
  );

  function setActiveSession(id: string) {
    const exists = sessions.value.some((s) => s.id === id);
    if (exists) {
      activeSessionId.value = id;
    }
  }

  function addSession(session: Session) {
    sessions.value.push(session);
    activeSessionId.value = session.id;
  }

  function removeSession(id: string) {
    sessions.value = sessions.value.filter((s) => s.id !== id);
    if (activeSessionId.value === id) {
      activeSessionId.value = sessions.value[0]?.id ?? null;
    }
  }

  function updateSessionActivity(id: string) {
    const session = sessions.value.find((s) => s.id === id);
    if (session) {
      session.lastActivityAt = Date.now();
      session.messageCount += 1;
    }
  }

  return {
    sessions,
    activeSessionId,
    activeSession,
    sortedSessions,
    setActiveSession,
    addSession,
    removeSession,
    updateSessionActivity,
  };
});
