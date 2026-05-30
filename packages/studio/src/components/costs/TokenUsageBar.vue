<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{
  inputTokens: number;
  outputTokens: number;
  height?: number;
}>();

const total = computed(() => props.inputTokens + props.outputTokens);
const inputPct = computed(() => (total.value === 0 ? 50 : (props.inputTokens / total.value) * 100));
const outputPct = computed(() => 100 - inputPct.value);

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}
</script>

<template>
  <div class="w-full">
    <div
      class="flex w-full overflow-hidden"
      :style="{ height: `${height ?? 8}px`, borderRadius: '4px' }"
    >
      <div
        class="bg-blue-400 transition-all duration-500 ease-out"
        :style="{ width: `${inputPct}%` }"
      />
      <div
        class="bg-emerald-400 transition-all duration-500 ease-out"
        :style="{ width: `${outputPct}%` }"
      />
    </div>
    <div class="flex justify-between mt-1 text-[10px] text-gray-500 font-mono">
      <span>in {{ formatTokens(inputTokens) }}</span>
      <span>out {{ formatTokens(outputTokens) }}</span>
    </div>
  </div>
</template>
