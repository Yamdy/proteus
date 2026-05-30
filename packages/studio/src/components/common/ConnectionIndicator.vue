<script setup lang="ts">
import { computed, ref } from "vue";
import { useConnectionStore } from "../../stores/connectionStore";

const store = useConnectionStore();
const showTooltip = ref(false);

const dotColor = computed(() => {
  switch (store.status) {
    case "connected":
      return "bg-emerald-400";
    case "connecting":
    case "reconnecting":
      return "bg-yellow-400";
    case "error":
      return "bg-red-400";
    case "disconnected":
    default:
      return "bg-gray-500";
  }
});

const pulseColor = computed(() => {
  switch (store.status) {
    case "connected":
      return "bg-emerald-400";
    case "connecting":
    case "reconnecting":
      return "bg-yellow-400";
    default:
      return "";
  }
});

const shouldPulse = computed(
  () => store.status === "connected" || store.status === "connecting" || store.status === "reconnecting",
);

const tooltipText = computed(() => {
  switch (store.status) {
    case "connected":
      return "Connected";
    case "connecting":
      return "Connecting…";
    case "reconnecting":
      return `Reconnecting (attempt ${store.reconnectAttempt})…`;
    case "error":
      return store.lastError ?? "Connection error";
    case "disconnected":
    default:
      return "Disconnected";
  }
});
</script>

<template>
  <div
    class="relative inline-flex items-center"
    @mouseenter="showTooltip = true"
    @mouseleave="showTooltip = false"
  >
    <span class="relative flex h-2 w-2">
      <span
        v-if="shouldPulse"
        class="absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping"
        :class="pulseColor"
      />
      <span
        class="relative inline-flex rounded-full h-2 w-2"
        :class="dotColor"
      />
    </span>

    <!-- Tooltip -->
    <Transition name="tooltip-fade">
      <div
        v-if="showTooltip"
        class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1.5 text-xs font-medium text-gray-100 bg-gray-800 border border-gray-700 rounded-md shadow-lg whitespace-nowrap pointer-events-none z-50"
      >
        {{ tooltipText }}
        <div
          class="absolute top-full left-1/2 -translate-x-1/2 -mt-px w-2 h-2 bg-gray-800 border-b border-r border-gray-700 rotate-45"
        />
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.tooltip-fade-enter-active,
.tooltip-fade-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}
.tooltip-fade-enter-from,
.tooltip-fade-leave-to {
  opacity: 0;
  transform: translate(-50%, 4px);
}
</style>
