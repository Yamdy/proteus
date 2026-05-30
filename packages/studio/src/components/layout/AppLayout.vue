<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import AppSidebar from "./AppSidebar.vue";
import ConnectionIndicator from "../common/ConnectionIndicator.vue";
import EventToast from "../common/EventToast.vue";
import { useWebSocket } from "../../composables/useWebSocket";
import { useToastStore, type ToastType } from "../../stores/toastStore";
import type { WsPhaseEvent, WsToolCallEvent, WsCostEvent } from "../../stores/connectionStore";

const sidebarCollapsed = ref(false);
const mobileMenuOpen = ref(false);
const isMobile = ref(false);

const toastStore = useToastStore();

function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

// Connect WebSocket and register global event handlers for toasts
useWebSocket({
  onPhase(event: WsPhaseEvent) {
    const { phase, status: phaseStatus, timestamp } = event.data;
    const type: ToastType = phaseStatus === "error" ? "error" : "phase";
    toastStore.addToast(
      type,
      `Phase: ${phase}`,
      `${phaseStatus} at ${formatTimestamp(timestamp)}`,
    );
  },
  onToolCall(event: WsToolCallEvent) {
    const { tool, timestamp } = event.data;
    toastStore.addToast(
      "tool_call",
      `Tool Call: ${tool}`,
      `Invoked at ${formatTimestamp(timestamp)}`,
    );
  },
  onCostUpdate(event: WsCostEvent) {
    const { amount, currency, model, timestamp } = event.data;
    const modelLabel = model ? ` (${model})` : "";
    toastStore.addToast(
      "cost",
      `Cost Update${modelLabel}`,
      `${currency} ${amount.toFixed(4)} at ${formatTimestamp(timestamp)}`,
    );
  },
});

function checkMobile() {
  isMobile.value = window.innerWidth < 768;
  if (!isMobile.value) {
    mobileMenuOpen.value = false;
  }
}

function toggleSidebar() {
  if (isMobile.value) {
    mobileMenuOpen.value = !mobileMenuOpen.value;
  } else {
    sidebarCollapsed.value = !sidebarCollapsed.value;
  }
}

function closeMobileMenu() {
  if (isMobile.value) {
    mobileMenuOpen.value = false;
  }
}

onMounted(() => {
  checkMobile();
  window.addEventListener("resize", checkMobile);
});

onUnmounted(() => {
  window.removeEventListener("resize", checkMobile);
});
</script>

<template>
  <div class="min-h-screen bg-gray-950 text-gray-100">
    <!-- Mobile overlay -->
    <div
      v-if="isMobile && mobileMenuOpen"
      class="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm transition-opacity"
      @click="closeMobileMenu"
    />

    <!-- Sidebar -->
    <div
      v-if="!isMobile"
      :class="sidebarCollapsed ? 'w-16' : 'w-60'"
      class="transition-all duration-200"
    >
      <AppSidebar :collapsed="sidebarCollapsed" @toggle="toggleSidebar" />
    </div>

    <!-- Mobile sidebar -->
    <Transition name="slide-left">
      <div v-if="isMobile && mobileMenuOpen" class="fixed inset-y-0 left-0 z-40">
        <AppSidebar :collapsed="false" @toggle="toggleSidebar" />
      </div>
    </Transition>

    <!-- Main content -->
    <div
      class="flex flex-col min-h-screen transition-all duration-200"
      :class="isMobile ? 'ml-0' : sidebarCollapsed ? 'ml-16' : 'ml-60'"
    >
      <!-- Top bar (mobile) -->
      <header
        v-if="isMobile"
        class="h-14 shrink-0 flex items-center justify-between px-4 border-b border-gray-800 bg-gray-900/80 backdrop-blur-sm"
      >
        <button
          @click="toggleSidebar"
          class="p-1.5 rounded-md text-gray-400 hover:text-gray-200 hover:bg-gray-800 transition-colors"
        >
          <svg
            class="w-5 h-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            stroke-width="1.5"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"
            />
          </svg>
        </button>
        <span class="text-sm font-semibold text-gray-100">Proteus Studio</span>
        <ConnectionIndicator />
      </header>

      <!-- Page content -->
      <main class="flex-1 overflow-auto">
        <router-view v-slot="{ Component }">
          <transition name="fade" mode="out-in">
            <component :is="Component" />
          </transition>
        </router-view>
      </main>
    </div>

    <!-- Global toast container -->
    <EventToast />
  </div>
</template>

<style scoped>
.slide-left-enter-active,
.slide-left-leave-active {
  transition: transform 0.2s ease;
}
.slide-left-enter-from,
.slide-left-leave-to {
  transform: translateX(-100%);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
