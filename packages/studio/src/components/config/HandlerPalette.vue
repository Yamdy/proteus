<script setup lang="ts">
import { computed } from "vue";
import { useConfigStore } from "../../stores/configStore";
import type { TrustLevel } from "../../stores/configStore";

const configStore = useConfigStore();

interface AvailableHandler {
  name: string;
  description: string;
  defaultTrust: TrustLevel;
  defaultEvents: string[];
}

const availableHandlers: AvailableHandler[] = [
  {
    name: "Input Guard",
    description: "Validates and sanitizes incoming user messages",
    defaultTrust: "low",
    defaultEvents: ["user.message"],
  },
  {
    name: "Context Builder",
    description: "Assembles conversation context and memory",
    defaultTrust: "medium",
    defaultEvents: ["context.request"],
  },
  {
    name: "Tool Router",
    description: "Routes requests to appropriate tool executors",
    defaultTrust: "medium",
    defaultEvents: ["tool.call"],
  },
  {
    name: "Response Synthesizer",
    description: "Generates the final response from model output",
    defaultTrust: "high",
    defaultEvents: ["model.output"],
  },
  {
    name: "Output Filter",
    description: "Filters and post-processes model responses",
    defaultTrust: "medium",
    defaultEvents: ["response.ready"],
  },
  {
    name: "Error Handler",
    description: "Catches and handles pipeline errors gracefully",
    defaultTrust: "high",
    defaultEvents: ["error"],
  },
];

const addedNames = computed(() =>
  new Set(configStore.level1.handlers.map((h) => h.name))
);

function addNewHandler(template: AvailableHandler) {
  const maxPriority = configStore.level1.handlers.reduce(
    (max, h) => Math.max(max, h.priority),
    0
  );
  configStore.addHandler({
    name: template.name,
    priority: maxPriority + 10,
    trust: template.defaultTrust,
    events: [...template.defaultEvents],
    promptTemplate: "",
    variableBindings: {},
  });
}
</script>

<template>
  <div class="flex flex-col h-full">
    <div class="px-4 py-3 border-b border-gray-800">
      <h3 class="text-xs font-semibold uppercase tracking-wider text-gray-400">
        Handler Palette
      </h3>
      <p class="text-[11px] text-gray-600 mt-0.5">Click to add to pipeline</p>
    </div>
    <div class="flex-1 overflow-y-auto py-2 px-2">
      <button
        v-for="handler in availableHandlers"
        :key="handler.name"
        @click="addNewHandler(handler)"
        :disabled="addedNames.has(handler.name)"
        class="w-full text-left px-3 py-2.5 rounded-md mb-1 transition-all duration-150 group"
        :class="
          addedNames.has(handler.name)
            ? 'opacity-40 cursor-not-allowed'
            : 'hover:bg-gray-800/80 cursor-pointer active:scale-[0.98]'
        "
      >
        <div class="flex items-center justify-between">
          <span class="text-sm font-medium text-gray-200">{{
            handler.name
          }}</span>
          <span
            v-if="addedNames.has(handler.name)"
            class="text-[10px] text-emerald-500 font-mono"
            >added</span
          >
          <svg
            v-else
            class="w-4 h-4 text-gray-600 group-hover:text-blue-400 transition-colors"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            stroke-width="2"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M12 4v16m8-8H4"
            />
          </svg>
        </div>
        <p class="text-[11px] text-gray-500 mt-0.5 leading-snug">
          {{ handler.description }}
        </p>
      </button>
    </div>
  </div>
</template>
