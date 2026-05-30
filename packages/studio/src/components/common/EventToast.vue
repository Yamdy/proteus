<script setup lang="ts">
import { computed } from "vue";
import { useToastStore, type ToastType } from "../../stores/toastStore";

const toastStore = useToastStore();

const toasts = computed(() => toastStore.toasts);

const borderColor: Record<ToastType, string> = {
  phase: "border-l-blue-400",
  tool_call: "border-l-violet-400",
  cost: "border-l-amber-400",
  info: "border-l-gray-400",
  error: "border-l-red-400",
};

const iconPath: Record<ToastType, string> = {
  phase: "M13 10V3L4 14h7v7l9-11h-7z",
  tool_call: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z",
  cost: "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  info: "M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  error: "M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z",
};

function dismiss(id: string) {
  toastStore.dismiss(id);
}
</script>

<template>
  <Teleport to="body">
    <div
      aria-live="polite"
      class="fixed bottom-4 right-4 z-50 flex flex-col-reverse gap-2 max-w-sm w-full pointer-events-none"
    >
      <TransitionGroup name="toast-stack">
        <div
          v-for="toast in toasts"
          :key="toast.id"
          class="pointer-events-auto bg-gray-800 border-l-4 rounded-md shadow-xl overflow-hidden"
          :class="borderColor[toast.type]"
        >
          <div class="flex items-start gap-3 px-3.5 py-3">
            <!-- Icon -->
            <svg
              class="w-4 h-4 mt-0.5 shrink-0 text-gray-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              stroke-width="1.5"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                :d="iconPath[toast.type]"
              />
            </svg>

            <!-- Content -->
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium text-gray-100 truncate">
                {{ toast.title }}
              </p>
              <p class="mt-0.5 text-xs text-gray-400 leading-snug line-clamp-2">
                {{ toast.message }}
              </p>
            </div>

            <!-- Dismiss -->
            <button
              @click="dismiss(toast.id)"
              class="shrink-0 p-0.5 rounded text-gray-500 hover:text-gray-300 hover:bg-gray-700 transition-colors"
              aria-label="Dismiss"
            >
              <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped>
.toast-stack-enter-active {
  transition: all 0.25s ease-out;
}
.toast-stack-leave-active {
  transition: all 0.2s ease-in;
}
.toast-stack-enter-from {
  opacity: 0;
  transform: translateX(100%);
}
.toast-stack-leave-to {
  opacity: 0;
  transform: translateX(100%);
}
.toast-stack-move {
  transition: transform 0.25s ease;
}
</style>
