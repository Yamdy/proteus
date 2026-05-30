<script setup lang="ts">
import { computed, ref, nextTick, watch } from "vue";
import { useChat } from "../../composables/useChat";
import { useSessionStore } from "../../stores/sessionStore";
import MessageBubble from "./MessageBubble.vue";
import ChatInput from "./ChatInput.vue";

const sessionStore = useSessionStore();
const { isStreaming, sendMessage, getMessages } = useChat();

const messagesEl = ref<HTMLDivElement | null>(null);

const activeSessionId = computed(() => sessionStore.activeSessionId);

const messages = computed(() => {
  const id = activeSessionId.value;
  if (!id) return [];
  return getMessages(id);
});

// Auto-scroll to bottom when messages change
watch(
  messages,
  () => {
    scrollToBottom();
  },
  { deep: true },
);

// Also scroll when streaming updates content
watch(isStreaming, () => {
  scrollToBottom();
});

function scrollToBottom() {
  nextTick(() => {
    if (messagesEl.value) {
      messagesEl.value.scrollTop = messagesEl.value.scrollHeight;
    }
  });
}

async function handleSend(text: string) {
  const id = activeSessionId.value;
  if (!id) return;
  await sendMessage(id, text);
  scrollToBottom();
}
</script>

<template>
  <div class="flex-1 flex flex-col min-w-0">
    <!-- No active session: empty state -->
    <div v-if="!activeSessionId" class="flex-1 flex items-center justify-center">
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
        <MessageBubble
          v-for="msg in messages"
          :key="msg.id"
          :message="msg"
        />
      </div>

      <!-- Input -->
      <ChatInput
        :disabled="isStreaming"
        @send="handleSend"
      />
    </template>
  </div>
</template>
