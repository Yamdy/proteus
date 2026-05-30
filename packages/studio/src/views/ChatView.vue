<script setup lang="ts">
import SessionSidebar from "../components/session/SessionSidebar.vue";
import ChatArea from "../components/chat/ChatArea.vue";
</script>

<template>
  <div class="flex h-[calc(100vh-0px)]">
    <!-- Session sidebar (left) -->
    <SessionSidebar />

    <!-- Chat area (right) -->
    <ChatArea />
  </div>
</template>
