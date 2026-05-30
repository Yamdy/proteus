<script setup lang="ts">
import { onMounted } from "vue";
import { useConfigStore } from "../stores/configStore";
import Level1FlowEditor from "../components/config/Level1FlowEditor.vue";
import HandlerDetailPanel from "../components/config/HandlerDetailPanel.vue";
import HandlerPalette from "../components/config/HandlerPalette.vue";

const configStore = useConfigStore();

onMounted(() => {
  configStore.fetchConfig();
});
</script>

<template>
  <div class="h-full flex flex-col">
    <!-- Header -->
    <div class="px-6 py-4 border-b border-gray-800 shrink-0">
      <div class="flex items-center gap-2 mb-1">
        <span
          class="text-[10px] font-mono uppercase tracking-widest text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded"
          >Level 1</span
        >
      </div>
      <h1 class="text-2xl font-semibold text-gray-100">
        Handler Pipeline Editor
      </h1>
      <p class="mt-1 text-sm text-gray-500">
        Configure the processing pipeline. Handlers execute in priority order.
      </p>
    </div>

    <!-- Loading / Error states -->
    <div
      v-if="configStore.loading"
      class="flex items-center gap-2 text-gray-400 text-sm px-6 py-8"
    >
      <svg
        class="w-4 h-4 animate-spin"
        fill="none"
        viewBox="0 0 24 24"
      >
        <circle
          class="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          stroke-width="4"
        />
        <path
          class="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
        />
      </svg>
      Loading configuration...
    </div>

    <div
      v-else-if="configStore.error"
      class="mx-6 mt-4 rounded-lg bg-red-900/20 border border-red-800/40 px-4 py-3 text-sm text-red-300"
    >
      {{ configStore.error }}
    </div>

    <!-- Main layout: 3-column -->
    <div v-else class="flex-1 flex min-h-0">
      <!-- Left: Handler Palette -->
      <aside
        class="w-60 shrink-0 border-r border-gray-800 bg-gray-900/50 overflow-hidden"
      >
        <HandlerPalette />
      </aside>

      <!-- Center: Flow Editor -->
      <div class="flex-1 min-w-0 overflow-hidden">
        <Level1FlowEditor />
      </div>

      <!-- Right: Detail Panel -->
      <aside
        class="w-72 shrink-0 border-l border-gray-800 bg-gray-900/50 overflow-hidden"
      >
        <HandlerDetailPanel />
      </aside>
    </div>

    <!-- Footer -->
    <div
      class="px-6 py-3 border-t border-gray-800 flex items-center justify-between shrink-0"
    >
      <span class="text-xs text-gray-600 font-mono">
        {{ configStore.level1.handlers.length }} handler{{
          configStore.level1.handlers.length !== 1 ? "s" : ""
        }}
        in pipeline
      </span>
      <button
        @click="configStore.saveConfig"
        :disabled="configStore.loading"
        class="px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50 transition-colors"
      >
        Save Pipeline
      </button>
    </div>
  </div>
</template>
