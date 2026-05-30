<script setup lang="ts">
import { computed } from "vue";
import { useConfigStore } from "../../stores/configStore";
import type { TrustLevel } from "../../stores/configStore";

const configStore = useConfigStore();

const handlers = computed(() => configStore.level1.handlers);
const selectedId = computed(() => configStore.selectedHandlerId);

// Layout constants
const NODE_W = 260;
const NODE_H = 120;
const NODE_GAP = 60;
const PADDING_X = 40;
const PADDING_TOP = 30;

function nodeX(): number {
  return PADDING_X;
}

function nodeY(index: number): number {
  return PADDING_TOP + index * (NODE_H + NODE_GAP);
}

const svgHeight = computed(() => {
  if (handlers.value.length === 0) return 200;
  return PADDING_TOP + handlers.value.length * (NODE_H + NODE_GAP) - NODE_GAP + PADDING_TOP;
});

const svgWidth = computed(() => PADDING_X * 2 + NODE_W);

function trustColor(level: TrustLevel): string {
  switch (level) {
    case "low":
      return "#ef4444";
    case "medium":
      return "#eab308";
    case "high":
      return "#22c55e";
  }
}

function trustBg(level: TrustLevel): string {
  switch (level) {
    case "low":
      return "rgba(239,68,68,0.15)";
    case "medium":
      return "rgba(234,179,8,0.15)";
    case "high":
      return "rgba(34,197,94,0.15)";
  }
}

function selectHandler(id: string) {
  configStore.selectHandler(id);
}
</script>

<template>
  <div class="w-full h-full overflow-auto bg-gray-950">
    <!-- Empty state -->
    <div
      v-if="handlers.length === 0"
      class="flex flex-col items-center justify-center h-full text-center px-8"
    >
      <svg
        class="w-12 h-12 text-gray-700 mb-3"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        stroke-width="1"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25a2.25 2.25 0 01-2.25-2.25v-2.25z"
        />
      </svg>
      <p class="text-sm text-gray-600">No handlers in pipeline</p>
      <p class="text-xs text-gray-700 mt-1">
        Add handlers from the palette on the left
      </p>
    </div>

    <!-- SVG Flow Chart -->
    <svg
      v-else
      :width="svgWidth"
      :height="svgHeight"
      :viewBox="`0 0 ${svgWidth} ${svgHeight}`"
      xmlns="http://www.w3.org/2000/svg"
      class="mx-auto"
    >
      <defs>
        <!-- Arrow marker -->
        <marker
          id="arrowhead"
          markerWidth="8"
          markerHeight="6"
          refX="8"
          refY="3"
          orient="auto"
        >
          <path d="M0,0 L8,3 L0,6" fill="#4b5563" />
        </marker>
        <marker
          id="arrowhead-selected"
          markerWidth="8"
          markerHeight="6"
          refX="8"
          refY="3"
          orient="auto"
        >
          <path d="M0,0 L8,3 L0,6" fill="#3b82f6" />
        </marker>
      </defs>

      <!-- Connecting arrows between nodes -->
      <template v-for="(handler, idx) in handlers" :key="'arrow-' + handler.id">
        <line
          v-if="idx < handlers.length - 1"
          :x1="nodeX() + NODE_W / 2"
          :y1="nodeY(idx) + NODE_H"
          :x2="nodeX() + NODE_W / 2"
          :y2="nodeY(idx + 1)"
          stroke="#4b5563"
          stroke-width="1.5"
          stroke-dasharray="4 3"
          marker-end="url(#arrowhead)"
          class="transition-colors duration-150"
        />
      </template>

      <!-- Handler nodes -->
      <g
        v-for="(handler, idx) in handlers"
        :key="handler.id"
        @click="selectHandler(handler.id)"
        class="cursor-pointer"
        role="button"
        :aria-label="`Select handler: ${handler.name}`"
      >
        <!-- Node background -->
        <rect
          :x="nodeX()"
          :y="nodeY(idx)"
          :width="NODE_W"
          :height="NODE_H"
          rx="8"
          class="transition-all duration-150"
          :fill="selectedId === handler.id ? '#111827' : '#1f2937'"
          :stroke="selectedId === handler.id ? '#3b82f6' : '#374151'"
          :stroke-width="selectedId === handler.id ? 2 : 1"
          :filter="selectedId === handler.id ? 'url(#glow)' : ''"
        />

        <!-- Selected glow effect -->
        <rect
          v-if="selectedId === handler.id"
          :x="nodeX() - 3"
          :y="nodeY(idx) - 3"
          :width="NODE_W + 6"
          :height="NODE_H + 6"
          rx="10"
          fill="none"
          stroke="#3b82f6"
          stroke-width="1"
          opacity="0.3"
          class="animate-pulse-ring"
        />

        <!-- Priority badge (top-right) -->
        <rect
          :x="nodeX() + NODE_W - 50"
          :y="nodeY(idx) + 8"
          :width="42"
          :height="20"
          rx="4"
          fill="rgba(59,130,246,0.15)"
        />
        <text
          :x="nodeX() + NODE_W - 29"
          :y="nodeY(idx) + 22"
          text-anchor="middle"
          class="fill-blue-400 text-[10px] font-mono select-none"
          font-size="10"
        >
          P{{ handler.priority }}
        </text>

        <!-- Handler name -->
        <text
          :x="nodeX() + 14"
          :y="nodeY(idx) + 28"
          class="fill-gray-100 text-sm font-medium select-none"
          font-size="14"
        >
          {{ handler.name }}
        </text>

        <!-- Trust badge -->
        <rect
          :x="nodeX() + 14"
          :y="nodeY(idx) + 38"
          width="52"
          height="18"
          rx="4"
          :fill="trustBg(handler.trust)"
        />
        <text
          :x="nodeX() + 40"
          :y="nodeY(idx) + 51"
          text-anchor="middle"
          class="text-[10px] font-mono select-none"
          font-size="10"
          :fill="trustColor(handler.trust)"
        >
          {{ handler.trust }}
        </text>

        <!-- Events (horizontal scrollable chips) -->
        <foreignObject
          :x="nodeX() + 74"
          :y="nodeY(idx) + 38"
          :width="NODE_W - 90"
          height="20"
        >
          <div
            xmlns="http://www.w3.org/1999/xhtml"
            class="flex gap-1 overflow-hidden h-5"
          >
            <span
              v-for="evt in handler.events.slice(0, 3)"
              :key="evt"
              class="inline-block px-1.5 py-0.5 bg-gray-800 border border-gray-700 rounded text-[10px] font-mono text-gray-400 whitespace-nowrap shrink-0"
            >
              {{ evt }}
            </span>
            <span
              v-if="handler.events.length > 3"
              class="inline-block px-1.5 py-0.5 text-[10px] text-gray-600 whitespace-nowrap shrink-0"
            >
              +{{ handler.events.length - 3 }}
            </span>
          </div>
        </foreignObject>

        <!-- Prompt template preview -->
        <text
          :x="nodeX() + 14"
          :y="nodeY(idx) + 78"
          class="text-[11px] font-mono select-none"
          font-size="11"
          :fill="handler.promptTemplate ? '#6b7280' : '#374151'"
        >
          {{
            handler.promptTemplate
              ? handler.promptTemplate.length > 38
                ? handler.promptTemplate.slice(0, 38) + "..."
                : handler.promptTemplate
              : "no prompt template"
          }}
        </text>

        <!-- Variable bindings count -->
        <text
          v-if="Object.keys(handler.variableBindings).length > 0"
          :x="nodeX() + NODE_W - 14"
          :y="nodeY(idx) + NODE_H - 12"
          text-anchor="end"
          class="text-[10px] font-mono select-none"
          font-size="10"
          fill="#4b5563"
        >
          {{ Object.keys(handler.variableBindings).length }} binding{{
            Object.keys(handler.variableBindings).length !== 1 ? "s" : ""
          }}
        </text>
      </g>
    </svg>
  </div>
</template>

<style scoped>
@keyframes pulse-ring {
  0%,
  100% {
    opacity: 0.3;
  }
  50% {
    opacity: 0.1;
  }
}

.animate-pulse-ring {
  animation: pulse-ring 2s ease-in-out infinite;
}

.select-none {
  user-select: none;
}
</style>
