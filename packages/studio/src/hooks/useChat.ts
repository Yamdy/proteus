import { useCallback, useRef } from "react";
import { useSessionStore, type Message } from "../stores/sessionStore";

const API_BASE = "/api/sessions";

interface SendMessageOptions {
  onChunk?: (chunk: string) => void;
  onComplete?: (fullContent: string) => void;
  onError?: (error: Error) => void;
  maxRetries?: number;
}

export function useChat() {
  const {
    addMessage,
    appendToMessage,
    setMessageStreaming,
    getMessages,
  } = useSessionStore();

  const abortControllerRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback(
    async (sessionId: string, content: string) => {
      const userMessage: Message = {
        id: crypto.randomUUID(),
        sessionId,
        role: "user",
        content,
        timestamp: Date.now(),
      };
      addMessage(sessionId, userMessage);
      return userMessage;
    },
    [addMessage],
  );

  const streamResponse = useCallback(
    async (sessionId: string, content: string, options: SendMessageOptions = {}) => {
      const { onChunk, onComplete, onError, maxRetries = 2 } = options;

      // Create assistant placeholder
      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        sessionId,
        role: "assistant",
        content: "",
        timestamp: Date.now(),
        streaming: true,
      };
      addMessage(sessionId, assistantMessage);

      let retries = 0;
      let fullContent = "";

      const attemptStream = async (): Promise<void> => {
        // Abort any previous stream
        abortControllerRef.current?.abort();
        const controller = new AbortController();
        abortControllerRef.current = controller;

        try {
          const res = await fetch(`${API_BASE}/${sessionId}/stream`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content }),
            signal: controller.signal,
          });

          if (!res.ok) {
            throw new Error(`Stream request failed: ${res.status}`);
          }

          const reader = res.body?.getReader();
          if (!reader) throw new Error("No readable stream");

          const decoder = new TextDecoder();
          let buffer = "";

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";

            for (const line of lines) {
              if (line.startsWith("data: ")) {
                const data = line.slice(6);
                if (data === "[DONE]") {
                  setMessageStreaming(sessionId, assistantMessage.id, false);
                  onComplete?.(fullContent);
                  return;
                }
                try {
                  const parsed = JSON.parse(data);
                  const chunk = parsed.content ?? parsed.delta?.content ?? "";
                  if (chunk) {
                    fullContent += chunk;
                    appendToMessage(sessionId, assistantMessage.id, chunk);
                    onChunk?.(chunk);
                  }
                } catch {
                  // Non-JSON data line, treat as raw text
                  fullContent += data;
                  appendToMessage(sessionId, assistantMessage.id, data);
                  onChunk?.(data);
                }
              }
            }
          }

          // Stream ended without [DONE]
          setMessageStreaming(sessionId, assistantMessage.id, false);
          onComplete?.(fullContent);
        } catch (err: unknown) {
          if (err instanceof Error && err.name === "AbortError") return;

          if (retries < maxRetries) {
            retries++;
            console.warn(`Stream error, retrying (${retries}/${maxRetries})...`);
            await new Promise((r) => setTimeout(r, 1000 * retries));
            return attemptStream();
          }

          setMessageStreaming(sessionId, assistantMessage.id, false);
          const error = err instanceof Error ? err : new Error(String(err));
          console.error("streamResponse error:", error);
          onError?.(error);
        }
      };

      await attemptStream();
      return assistantMessage;
    },
    [addMessage, appendToMessage, setMessageStreaming],
  );

  const cancelStream = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
  }, []);

  return {
    sendMessage,
    streamResponse,
    cancelStream,
    getMessages,
  };
}
