<script setup lang="ts">
import { computed } from "vue";
import SessionSidebar from "../components/session/SessionSidebar.vue";
import ChatArea from "../components/chat/ChatArea.vue";
import { useWebSocket } from "../composables/useWebSocket";
import { useSessionStore } from "../stores/sessionStore";

const sessionStore = useSessionStore();

// Subscribe/unsubscribe to active session's WebSocket events automatically
const activeSessionId = computed(() => sessionStore.activeSessionId);
useWebSocket({
  sessionIds: () => activeSessionId.value,
  autoConnect: false, // AppLayout already connects
});
</script>

<template>
  <div class="flex h-[calc(100vh-0px)]">
    <!-- Session sidebar (left) -->
    <SessionSidebar />

    <!-- Chat area (right) -->
    <ChatArea />
  </div>
</template>
