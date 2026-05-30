<script setup lang="ts">
import { ref, nextTick, watch } from "vue";
import { useSessionStore } from "../stores/sessionStore";
import SessionSidebar from "../components/session/SessionSidebar.vue";

const sessionStore = useSessionStore();

const messages = ref<Array<{ role: string; content: string; ts: number }>>([]);
const input = ref("");
const messagesEl = ref<HTMLDivElement | null>(null);
const isLoading = ref(false);

// Track messages per session
const messagesBySession = ref<Record<string, Array<{ role: string; content: string; ts: number }>>>({});

function scrollToBottom() {
  nextTick(() => {
    if (messagesEl.value) {
      messagesEl.value.scrollTop = messagesEl.value.scrollHeight;
    }
  });
}

// Switch message buffer when active session changes
watch(
  () => sessionStore.activeSessionId,
  (newId, oldId) => {
    // Save current messages to old session
    if (oldId) {
      messagesBySession.value[oldId] = messages.value;
    }
    // Restore messages for new session (or start empty)
    messages.value = newId ? (messagesBySession.value[newId] ?? []) : [];
    scrollToBottom();
  },
  { immediate: true }
);

async function sendMessage() {
  const text = input.value.trim();
  if (!text || isLoading.value || !sessionStore.activeSessionId) return;

  messages.value.push({ role: "user", content: text, ts: Date.now() });
  sessionStore.updateSessionActivity(sessionStore.activeSessionId);
  input.value = "";
  scrollToBottom();

  isLoading.value = true;
  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text, sessionId: sessionStore.activeSessionId }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    messages.value.push({
      role: "assistant",
      content: data.reply ?? "(no response)",
      ts: Date.now(),
    });
  } catch (e) {
    messages.value.push({
      role: "system",
      content: `Error: ${e instanceof Error ? e.message : "Request failed"}`,
      ts: Date.now(),
    });
  } finally {
    isLoading.value = false;
    scrollToBottom();
  }
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
}
</script>

<template>
  <div class="flex h-[calc(100vh-0px)]">
    <!-- Session sidebar (left) -->
    <SessionSidebar />

    <!-- Chat area (right) -->
    <div class="flex-1 flex flex-col min-w-0">
      <!-- No active session: empty state -->
      <div v-if="!sessionStore.activeSessionId" class="flex-1 flex items-center justify-center">
        <div class="text-center max-w-sm px-4">
          <div class="w-12 h-12 mx-auto mb-4 rounded-lg bg-gray-800 border border-gray-700 flex items-center justify-center">
            <svg class="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </div>
          <h2 class="text-sm font-medium text-gray-300 mb-1">No active session</h2>
          <p class="text-xs text-gray-600">Create a new session from the sidebar to start chatting.</p>
        </div>
      </div>

      <!-- Active session: messages + input -->
      <template v-else>
        <!-- Messages -->
        <div ref="messagesEl" class="flex-1 overflow-y-auto px-4 py-6 space-y-4">
          <!-- Empty conversation -->
          <div v-if="messages.length === 0" class="flex items-center justify-center h-full">
            <div class="text-center max-w-md">
              <div class="w-12 h-12 mx-auto mb-4 rounded-xl bg-blue-500/10 flex items-center justify-center">
                <svg class="w-6 h-6 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <h2 class="text-lg font-medium text-gray-200 mb-1">Start a conversation</h2>
              <p class="text-sm text-gray-500">Send a message to begin. Responses stream through the Proteus harness.</p>
            </div>
          </div>

          <!-- Message bubbles -->
          <div
            v-for="(msg, i) in messages"
            :key="i"
            class="flex gap-3 max-w-3xl mx-auto"
            :class="msg.role === 'user' ? 'justify-end' : 'justify-start'"
          >
            <div
              class="max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed"
              :class="{
                'bg-blue-600 text-white': msg.role === 'user',
                'bg-gray-800 text-gray-200': msg.role === 'assistant',
                'bg-red-900/40 text-red-300 border border-red-800/50': msg.role === 'system',
              }"
            >
              <pre class="whitespace-pre-wrap font-sans">{{ msg.content }}</pre>
            </div>
          </div>

          <!-- Typing indicator -->
          <div v-if="isLoading" class="flex gap-3 max-w-3xl mx-auto justify-start">
            <div class="bg-gray-800 rounded-2xl px-4 py-2.5">
              <div class="flex gap-1.5 items-center">
                <span class="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce" style="animation-delay: 0ms"></span>
                <span class="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce" style="animation-delay: 150ms"></span>
                <span class="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce" style="animation-delay: 300ms"></span>
              </div>
            </div>
          </div>
        </div>

        <!-- Input -->
        <div class="shrink-0 border-t border-gray-800 bg-gray-900/50 backdrop-blur-sm px-4 py-3">
          <div class="max-w-3xl mx-auto">
            <div class="flex gap-2 items-end">
              <textarea
                v-model="input"
                @keydown="handleKeydown"
                placeholder="Type a message..."
                rows="1"
                class="flex-1 resize-none bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/25 transition-colors"
                style="field-sizing: content; max-height: 160px"
              />
              <button
                @click="sendMessage"
                :disabled="!input.trim() || isLoading"
                class="shrink-0 p-2.5 rounded-xl bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <svg class="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>
