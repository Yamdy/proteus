<script setup lang="ts">
import { ref } from "vue";
import type { ToolCall } from "../../stores/observabilityStore";

defineProps<{
  toolCall: ToolCall;
}>();

const argsExpanded = ref(false);

function formatDuration(ms?: number): string {
  if (ms === undefined || ms === null) return "--";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatJson(value: unknown): string {
  if (value === undefined || value === null) return "null";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

</script>

<template>
  <div class="bg-gray-800 border-l-4 border-green-500 rounded-r-md overflow-hidden">
    <!-- Header -->
    <div class="px-3 py-2 flex items-center gap-3">
      <!-- Tool icon -->
      <div class="w-6 h-6 rounded bg-green-500/15 flex items-center justify-center shrink-0">
        <svg class="w-3.5 h-3.5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M11.42 15.17l-5.1-5.1m0 0L11.42 4.97m-5.1 5.1H21"
          />
        </svg>
      </div>

      <!-- Tool name and status -->
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2">
          <span class="text-sm font-mono font-medium text-gray-200 truncate">
            {{ toolCall.name }}
          </span>
          <span
            class="text-[10px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded-sm"
            :class="{
              'bg-gray-700 text-gray-400': toolCall.status === 'pending',
              'bg-blue-900/40 text-blue-400': toolCall.status === 'running',
              'bg-emerald-900/40 text-emerald-400': toolCall.status === 'completed',
              'bg-red-900/40 text-red-400': toolCall.status === 'error',
            }"
          >
            {{ toolCall.status }}
          </span>
        </div>
      </div>

      <!-- Duration -->
      <span class="text-xs font-mono text-gray-500 shrink-0">
        {{ formatDuration(toolCall.durationMs) }}
      </span>

      <!-- Args toggle -->
      <button
        v-if="toolCall.args !== undefined"
        @click="argsExpanded = !argsExpanded"
        class="p-1 rounded text-gray-500 hover:text-gray-300 hover:bg-gray-700 transition-colors shrink-0"
        :title="argsExpanded ? 'Collapse args' : 'Expand args'"
      >
        <svg
          class="w-3.5 h-3.5 transition-transform duration-150"
          :class="argsExpanded ? 'rotate-90' : ''"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          stroke-width="2"
        >
          <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </button>
    </div>

    <!-- Collapsible args section -->
    <Transition name="slide-args">
      <div v-if="argsExpanded && toolCall.args !== undefined" class="border-t border-gray-700/50">
        <div class="px-3 py-2">
          <span class="text-[10px] font-medium text-gray-500 uppercase tracking-wider mb-1 block">
            Arguments
          </span>
          <pre class="text-xs text-gray-300 font-mono bg-gray-900/60 rounded px-2.5 py-2 overflow-x-auto max-h-48 overflow-y-auto whitespace-pre-wrap break-all">{{ formatJson(toolCall.args) }}</pre>
        </div>
      </div>
    </Transition>

    <!-- Result (always visible if present) -->
    <div v-if="toolCall.result !== undefined" class="border-t border-gray-700/50 px-3 py-2">
      <span class="text-[10px] font-medium text-gray-500 uppercase tracking-wider mb-1 block">
        Result
      </span>
      <pre class="text-xs text-gray-300 font-mono bg-gray-900/60 rounded px-2.5 py-2 overflow-x-auto max-h-32 overflow-y-auto whitespace-pre-wrap break-all">{{ formatJson(toolCall.result) }}</pre>
    </div>

    <!-- Error -->
    <div v-if="toolCall.error" class="border-t border-red-800/30 px-3 py-2">
      <span class="text-[10px] font-medium text-red-400 uppercase tracking-wider mb-1 block">
        Error
      </span>
      <p class="text-xs text-red-300">{{ toolCall.error }}</p>
    </div>
  </div>
</template>

<style scoped>
.slide-args-enter-active,
.slide-args-leave-active {
  transition: all 0.15s ease;
  overflow: hidden;
}
.slide-args-enter-from,
.slide-args-leave-to {
  opacity: 0;
  max-height: 0;
}
.slide-args-enter-to,
.slide-args-leave-from {
  opacity: 1;
  max-height: 300px;
}
</style>
