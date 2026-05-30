<script setup lang="ts">
import { computed, ref } from "vue";
import type { Trace } from "../../stores/observabilityStore";
import ToolCallCard from "./ToolCallCard.vue";

const props = defineProps<{
  trace: Trace;
}>();

const emit = defineEmits<{
  (e: "select-phase", phase: string): void;
}>();

const expandedPhase = ref<string | null>(null);

// Color mapping for each phase type
const phaseColors: Record<string, { bar: string; text: string; bg: string; border: string }> = {
  context_assembly: {
    bar: "bg-blue-500",
    text: "text-blue-400",
    bg: "bg-blue-500/10",
    border: "border-blue-500/30",
  },
  llm_inference: {
    bar: "bg-purple-500",
    text: "text-purple-400",
    bg: "bg-purple-500/10",
    border: "border-purple-500/30",
  },
  action_resolution: {
    bar: "bg-orange-500",
    text: "text-orange-400",
    bg: "bg-orange-500/10",
    border: "border-orange-500/30",
  },
  tool_execution: {
    bar: "bg-green-500",
    text: "text-green-400",
    bg: "bg-green-500/10",
    border: "border-green-500/30",
  },
  result_observation: {
    bar: "bg-gray-500",
    text: "text-gray-400",
    bg: "bg-gray-500/10",
    border: "border-gray-500/30",
  },
};

// Human-readable phase labels
const phaseLabels: Record<string, string> = {
  context_assembly: "Context Assembly",
  llm_inference: "LLM Inference",
  action_resolution: "Action Resolution",
  tool_execution: "Tool Execution",
  result_observation: "Result Observation",
};

function getPhaseColor(name: string) {
  return phaseColors[name] ?? { bar: "bg-gray-600", text: "text-gray-400", bg: "bg-gray-600/10", border: "border-gray-600/30" };
}

function getPhaseLabel(name: string) {
  return phaseLabels[name] ?? name;
}

// Compute the total duration for proportional bar widths
const totalDuration = computed(() => {
  if (props.trace.totalDurationMs) return props.trace.totalDurationMs;
  // Sum of all phase durations, or fallback to elapsed time
  const sum = props.trace.phases.reduce((acc, p) => acc + (p.durationMs ?? 0), 0);
  if (sum > 0) return sum;
  // If trace is still running, use time since start
  if (!props.trace.endedAt) return Date.now() - props.trace.startedAt;
  return props.trace.endedAt - props.trace.startedAt;
});

// Build bar segments with computed widths
const segments = computed(() => {
  const total = totalDuration.value;
  if (total <= 0) {
    return props.trace.phases.map((p) => ({ ...p, widthPct: 100 / props.trace.phases.length }));
  }

  return props.trace.phases.map((p) => {
    let duration = p.durationMs ?? 0;
    // For a running phase with no duration yet, use elapsed time
    if (p.status === "running" && p.startedAt && !p.endedAt) {
      duration = Date.now() - p.startedAt;
    }
    const widthPct = Math.max(duration / total * 100, 0);
    return { ...p, widthPct };
  });
});

function formatDuration(ms?: number): string {
  if (ms === undefined || ms === null) return "--";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function toggleExpand(phaseName: string) {
  if (expandedPhase.value === phaseName) {
    expandedPhase.value = null;
  } else {
    expandedPhase.value = phaseName;
  }
  emit("select-phase", phaseName);
}

// Tool calls for the trace, filtered by phase if a phase is expanded
const traceToolCalls = computed(() => props.trace.toolCalls ?? []);

const filteredToolCalls = computed(() => {
  if (!expandedPhase.value || expandedPhase.value !== "tool_execution") return [];
  return traceToolCalls.value;
});
</script>

<template>
  <div class="space-y-3">
    <!-- Horizontal bar chart -->
    <div class="flex h-8 rounded-md overflow-hidden bg-gray-800/50 gap-px">
      <div
        v-for="seg in segments"
        :key="seg.name"
        class="relative group cursor-pointer transition-all duration-200"
        :style="{ width: Math.max(seg.widthPct, 2) + '%' }"
        :class="[
          getPhaseColor(seg.name).bar,
          seg.status === 'running' ? 'animate-pulse opacity-90' : '',
          seg.status === 'pending' ? 'opacity-20' : '',
          seg.status === 'error' ? 'bg-red-500' : '',
        ]"
        @click="toggleExpand(seg.name)"
      >
        <!-- Phase label inside bar (only if wide enough) -->
        <span
          v-if="seg.widthPct > 12"
          class="absolute inset-0 flex items-center justify-center text-[10px] font-medium text-white/90 truncate px-1.5"
        >
          {{ getPhaseLabel(seg.name) }}
        </span>

        <!-- Tooltip on hover -->
        <div
          class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1.5 rounded-md bg-gray-900 border border-gray-700 text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20 shadow-lg"
        >
          <span class="font-medium text-gray-200">{{ getPhaseLabel(seg.name) }}</span>
          <span class="text-gray-500 ml-1.5">{{ formatDuration(seg.durationMs) }}</span>
          <span
            class="ml-1.5"
            :class="{
              'text-gray-500': seg.status === 'pending',
              'text-blue-400': seg.status === 'running',
              'text-emerald-400': seg.status === 'completed',
              'text-red-400': seg.status === 'error',
            }"
          >
            {{ seg.status }}
          </span>
        </div>
      </div>
    </div>

    <!-- Phase legend row -->
    <div class="flex flex-wrap gap-x-4 gap-y-1">
      <div
        v-for="seg in segments"
        :key="seg.name"
        class="flex items-center gap-1.5 text-xs cursor-pointer select-none"
        :class="expandedPhase === seg.name ? 'opacity-100' : 'opacity-60 hover:opacity-80'"
        @click="toggleExpand(seg.name)"
      >
        <span
          class="w-2 h-2 rounded-full shrink-0"
          :class="{
            'bg-gray-600': seg.status === 'pending',
            'animate-pulse': seg.status === 'running',
          }"
          :style="
            seg.status !== 'pending'
              ? { backgroundColor: seg.status === 'error' ? '#ef4444' : undefined }
              : undefined
          "
        >
          <span
            v-if="seg.status !== 'pending'"
            class="block w-2 h-2 rounded-full"
            :class="getPhaseColor(seg.name).bar"
          />
        </span>
        <span :class="getPhaseColor(seg.name).text">{{ getPhaseLabel(seg.name) }}</span>
        <span class="text-gray-600 font-mono">{{ formatDuration(seg.durationMs) }}</span>
      </div>
    </div>

    <!-- Expanded phase detail -->
    <Transition name="expand-detail">
      <div
        v-if="expandedPhase"
        class="rounded-lg border bg-gray-900/60 px-4 py-3 space-y-3"
        :class="getPhaseColor(expandedPhase).border"
      >
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <span
              class="w-2.5 h-2.5 rounded-full"
              :class="{
                'bg-gray-600': segments.find((s) => s.name === expandedPhase)?.status === 'pending',
                'animate-pulse': segments.find((s) => s.name === expandedPhase)?.status === 'running',
              }"
            >
              <span
                v-if="segments.find((s) => s.name === expandedPhase)?.status !== 'pending'"
                class="block w-2.5 h-2.5 rounded-full"
                :class="getPhaseColor(expandedPhase).bar"
              />
            </span>
            <h4 class="text-sm font-medium" :class="getPhaseColor(expandedPhase).text">
              {{ getPhaseLabel(expandedPhase) }}
            </h4>
          </div>
          <button
            @click="expandedPhase = null"
            class="text-gray-500 hover:text-gray-300 transition-colors p-0.5"
          >
            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div class="grid grid-cols-3 gap-3 text-xs">
          <div>
            <span class="text-gray-500 block mb-0.5">Status</span>
            <span
              class="font-medium"
              :class="{
                'text-gray-500': segments.find((s) => s.name === expandedPhase)?.status === 'pending',
                'text-blue-400': segments.find((s) => s.name === expandedPhase)?.status === 'running',
                'text-emerald-400': segments.find((s) => s.name === expandedPhase)?.status === 'completed',
                'text-red-400': segments.find((s) => s.name === expandedPhase)?.status === 'error',
              }"
            >
              {{ segments.find((s) => s.name === expandedPhase)?.status ?? "unknown" }}
            </span>
          </div>
          <div>
            <span class="text-gray-500 block mb-0.5">Duration</span>
            <span class="text-gray-300 font-mono">
              {{ formatDuration(segments.find((s) => s.name === expandedPhase)?.durationMs) }}
            </span>
          </div>
          <div>
            <span class="text-gray-500 block mb-0.5">Started</span>
            <span class="text-gray-300 font-mono">
              {{
                segments.find((s) => s.name === expandedPhase)?.startedAt
                  ? new Date(segments.find((s) => s.name === expandedPhase)!.startedAt!).toLocaleTimeString()
                  : "--"
              }}
            </span>
          </div>
        </div>

        <!-- Error detail -->
        <div
          v-if="segments.find((s) => s.name === expandedPhase)?.error"
          class="rounded-md bg-red-900/20 border border-red-800/30 px-3 py-2 text-xs text-red-300"
        >
          {{ segments.find((s) => s.name === expandedPhase)?.error }}
        </div>

        <!-- Tool calls for tool_execution phase -->
        <div v-if="expandedPhase === 'tool_execution' && filteredToolCalls.length > 0" class="space-y-2 pt-1">
          <h5 class="text-xs font-medium text-gray-400 uppercase tracking-wider">Tool Calls</h5>
          <ToolCallCard
            v-for="tc in filteredToolCalls"
            :key="tc.id"
            :tool-call="tc"
          />
        </div>

        <div
          v-else-if="expandedPhase === 'tool_execution' && filteredToolCalls.length === 0"
          class="text-xs text-gray-600 italic pt-1"
        >
          No tool calls recorded for this phase
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.expand-detail-enter-active,
.expand-detail-leave-active {
  transition: all 0.2s ease;
  overflow: hidden;
}
.expand-detail-enter-from,
.expand-detail-leave-to {
  opacity: 0;
  max-height: 0;
  padding-top: 0;
  padding-bottom: 0;
}
.expand-detail-enter-to,
.expand-detail-leave-from {
  opacity: 1;
  max-height: 500px;
}
</style>
