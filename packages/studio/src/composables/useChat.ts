import { ref, watch } from "vue";
import { useSessionStore } from "../stores/sessionStore";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
  streaming?: boolean;
}

// Messages keyed by sessionId
const messagesBySession = ref<Map<string, ChatMessage[]>>(new Map());

function generateId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function useChat() {
  const sessionStore = useSessionStore();
  const isStreaming = ref(false);
  const error = ref<string | null>(null);

  const activeSessionId = ref(sessionStore.activeSessionId);

  watch(
    () => sessionStore.activeSessionId,
    (id) => {
      activeSessionId.value = id;
    },
  );

  function getMessages(sessionId: string): ChatMessage[] {
    return messagesBySession.value.get(sessionId) ?? [];
  }

  function addMessage(sessionId: string, msg: ChatMessage) {
    const list = messagesBySession.value.get(sessionId) ?? [];
    list.push(msg);
    // Force reactivity by setting a new array reference
    messagesBySession.value = new Map(messagesBySession.value.set(sessionId, [...list]));
  }

  function updateLastAssistant(sessionId: string, content: string, streaming?: boolean) {
    const list = messagesBySession.value.get(sessionId);
    if (!list) return;
    const last = list[list.length - 1];
    if (last && last.role === "assistant") {
      last.content = content;
      last.streaming = streaming;
      // Trigger reactivity
      messagesBySession.value = new Map(messagesBySession.value);
    }
  }

  async function sendMessage(sessionId: string, text: string): Promise<void> {
    if (!text.trim() || isStreaming.value || !sessionId) return;

    error.value = null;

    // Add user message
    const userMsg: ChatMessage = {
      id: generateId(),
      role: "user",
      content: text.trim(),
      timestamp: Date.now(),
    };
    addMessage(sessionId, userMsg);

    // Update session activity
    sessionStore.updateSessionActivity(sessionId);

    // Prepare assistant placeholder
    const assistantMsg: ChatMessage = {
      id: generateId(),
      role: "assistant",
      content: "",
      timestamp: Date.now(),
      streaming: true,
    };
    addMessage(sessionId, assistantMsg);

    isStreaming.value = true;

    try {
      const res = await fetch(`/api/chat/${sessionId}/stream`, {
        method: "GET",
        headers: { Accept: "text/event-stream" },
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }

      const body = res.body;
      if (!body) {
        throw new Error("No response body for SSE stream");
      }

      const reader = body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Parse SSE lines
        const lines = buffer.split("\n");
        // Keep incomplete last line in buffer
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith("data: ")) {
            const payload = trimmed.slice(6);
            if (payload === "[DONE]") {
              continue;
            }
            try {
              const parsed = JSON.parse(payload);
              const chunk = parsed.content ?? parsed.delta?.content ?? parsed.text ?? payload;
              accumulated += chunk;
              updateLastAssistant(sessionId, accumulated, true);
            } catch {
              // If not JSON, treat raw payload as text
              accumulated += payload;
              updateLastAssistant(sessionId, accumulated, true);
            }
          }
        }
      }

      // Finalize
      if (accumulated.length === 0) {
        updateLastAssistant(sessionId, "(no response)", false);
      } else {
        updateLastAssistant(sessionId, accumulated, false);
      }
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : "Stream failed";
      error.value = errMsg;
      // Replace the streaming placeholder with error
      updateLastAssistant(sessionId, `Error: ${errMsg}`, false);
    } finally {
      isStreaming.value = false;
    }
  }

  function clearMessages(sessionId: string) {
    messagesBySession.value.delete(sessionId);
    messagesBySession.value = new Map(messagesBySession.value);
  }

  return {
    isStreaming,
    error,
    getMessages,
    sendMessage,
    clearMessages,
    messagesBySession,
  };
}
