import { useEffect, useRef, useState } from "react";
import { useChat } from "../../hooks/useChat";
import { useSessionStore } from "../../stores/sessionStore";
import MessageBubble from "./MessageBubble";

export default function ChatArea() {
  const { currentSession, messages } = useSessionStore();
  const { sendMessage, streamResponse, cancelStream } = useChat();
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const currentMessages = currentSession
    ? messages[currentSession.id] ?? []
    : [];

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [currentMessages]);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 150)}px`;
    }
  }, [input]);

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || !currentSession || isStreaming) return;

    setInput("");
    setError(null);
    setIsStreaming(true);

    try {
      await sendMessage(currentSession.id, trimmed);
      await streamResponse(currentSession.id, trimmed, {
        onError: (err) => setError(err.message),
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setError(msg);
    } finally {
      setIsStreaming(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleCancel = () => {
    cancelStream();
    setIsStreaming(false);
  };

  if (!currentSession) {
    return (
      <div data-testid="chat-empty" className="flex h-full flex-col items-center justify-center gap-3 text-gray-500">
        <svg
          className="h-12 w-12 opacity-30"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
          />
        </svg>
        <p className="text-sm">Select or create a session to start chatting</p>
      </div>
    );
  }

  return (
    <div data-testid="chat-area" className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-800 px-6 py-3">
        <div>
          <h2 className="text-sm font-semibold text-white">
            {currentSession.name}
          </h2>
          <p className="text-[10px] text-gray-500">
            {currentMessages.length} message
            {currentMessages.length !== 1 ? "s" : ""}
          </p>
        </div>
        {isStreaming && (
          <button
            onClick={handleCancel}
            data-testid="stop-stream-btn"
            className="rounded-md border border-gray-700 px-3 py-1 text-xs text-gray-400 transition-colors hover:border-red-600 hover:text-red-400"
          >
            Stop
          </button>
        )}
      </div>

      {/* Messages */}
      <div data-testid="chat-messages" className="flex-1 overflow-y-auto px-6 py-4">
        {currentMessages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-gray-600">
            <p className="text-sm">No messages yet</p>
            <p className="text-xs">Send a message to start the conversation</p>
          </div>
        )}

        {currentMessages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}

        {isStreaming &&
          currentMessages.length > 0 &&
          !currentMessages[currentMessages.length - 1]?.streaming && (
            <div className="flex justify-start mb-4">
              <div className="rounded-2xl bg-gray-800 px-4 py-3">
                <div className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-500 [animation-delay:0ms]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-500 [animation-delay:150ms]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-500 [animation-delay:300ms]" />
                </div>
              </div>
            </div>
          )}

        <div ref={messagesEndRef} />
      </div>

      {/* Error banner */}
      {error && (
        <div className="mx-6 mb-2 flex items-center justify-between rounded-lg border border-red-800 bg-red-950 px-4 py-2 text-xs text-red-300">
          <span>{error}</span>
          <button
            onClick={() => setError(null)}
            className="ml-2 text-red-500 hover:text-red-300"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Input area */}
      <div className="border-t border-gray-800 px-6 py-4">
        <div className="flex items-end gap-3">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message... (Shift+Enter for new line)"
            rows={1}
            disabled={isStreaming}
            data-testid="chat-input"
            className="flex-1 resize-none rounded-xl border border-gray-700 bg-gray-900 px-4 py-3 text-sm text-gray-100 placeholder-gray-600 outline-none transition-colors focus:border-blue-600 disabled:opacity-50"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isStreaming}
            data-testid="send-btn"
            className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
