<script setup lang="ts">
import { ref, computed } from "vue";
import TokenUsageBar from "./TokenUsageBar.vue";

export interface CostEntry {
  id: string;
  sessionId: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  timestamp: number;
  turnIndex?: number;
  role?: string;
}

const props = defineProps<{
  entries: CostEntry[];
}>();

type SortKey = "model" | "inputTokens" | "outputTokens" | "costUsd" | "timestamp";
type SortDir = "asc" | "desc";

const sortKey = ref<SortKey>("timestamp");
const sortDir = ref<SortDir>("desc");
const expandedRows = ref<Set<string>>(new Set());

function toggleSort(key: SortKey) {
  if (sortKey.value === key) {
    sortDir.value = sortDir.value === "asc" ? "desc" : "asc";
  } else {
    sortKey.value = key;
    sortDir.value = "desc";
  }
}

function toggleRow(id: string) {
  if (expandedRows.value.has(id)) {
    expandedRows.value.delete(id);
  } else {
    expandedRows.value.add(id);
  }
}

const sortedEntries = computed(() => {
  const arr = [...props.entries];
  arr.sort((a, b) => {
    const aVal = a[sortKey.value] ?? 0;
    const bVal = b[sortKey.value] ?? 0;
    if (typeof aVal === "string" && typeof bVal === "string") {
      return sortDir.value === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    }
    const numA = Number(aVal);
    const numB = Number(bVal);
    return sortDir.value === "asc" ? numA - numB : numB - numA;
  });
  return arr;
});

function formatUsd(n: number) {
  return `$${n.toFixed(4)}`;
}

function formatTokens(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString();
}

function formatDate(ts: number) {
  return new Date(ts).toLocaleString();
}

function sortIndicator(key: SortKey) {
  if (sortKey.value !== key) return "";
  return sortDir.value === "asc" ? " ^" : " v";
}
</script>

<template>
  <div class="rounded-xl border border-gray-800 overflow-hidden">
    <table class="w-full text-sm">
      <thead>
        <tr class="border-b border-gray-800 bg-gray-900/80">
          <th
            class="text-left px-5 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider cursor-pointer select-none hover:text-gray-300 transition-colors"
            @click="toggleSort('model')"
          >
            Model{{ sortIndicator("model") }}
          </th>
          <th
            class="text-right px-5 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider cursor-pointer select-none hover:text-gray-300 transition-colors"
            @click="toggleSort('inputTokens')"
          >
            Input{{ sortIndicator("inputTokens") }}
          </th>
          <th
            class="text-right px-5 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider cursor-pointer select-none hover:text-gray-300 transition-colors"
            @click="toggleSort('outputTokens')"
          >
            Output{{ sortIndicator("outputTokens") }}
          </th>
          <th class="px-5 py-3 w-40">
            <span class="sr-only">Token Ratio</span>
          </th>
          <th
            class="text-right px-5 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider cursor-pointer select-none hover:text-gray-300 transition-colors"
            @click="toggleSort('costUsd')"
          >
            Cost{{ sortIndicator("costUsd") }}
          </th>
          <th
            class="text-right px-5 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider cursor-pointer select-none hover:text-gray-300 transition-colors"
            @click="toggleSort('timestamp')"
          >
            Time{{ sortIndicator("timestamp") }}
          </th>
        </tr>
      </thead>
      <tbody class="divide-y divide-gray-800/60">
        <template v-for="entry in sortedEntries" :key="entry.id">
          <tr
            class="hover:bg-gray-800/30 transition-colors cursor-pointer"
            :class="{ 'bg-gray-800/20': expandedRows.has(entry.id) }"
            @click="toggleRow(entry.id)"
          >
            <td class="px-5 py-3">
              <div class="flex items-center gap-2">
                <svg
                  class="w-3 h-3 text-gray-600 transition-transform duration-200"
                  :class="{ 'rotate-90': expandedRows.has(entry.id) }"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fill-rule="evenodd"
                    d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
                    clip-rule="evenodd"
                  />
                </svg>
                <span class="font-mono text-gray-300">{{ entry.model }}</span>
              </div>
            </td>
            <td class="px-5 py-3 text-right text-blue-400 font-mono">
              {{ formatTokens(entry.inputTokens) }}
            </td>
            <td class="px-5 py-3 text-right text-emerald-400 font-mono">
              {{ formatTokens(entry.outputTokens) }}
            </td>
            <td class="px-5 py-3">
              <TokenUsageBar :input-tokens="entry.inputTokens" :output-tokens="entry.outputTokens" />
            </td>
            <td class="px-5 py-3 text-right text-gray-200 font-mono">
              {{ formatUsd(entry.costUsd) }}
            </td>
            <td class="px-5 py-3 text-right text-gray-500 text-xs">
              {{ formatTime(entry.timestamp) }}
            </td>
          </tr>
          <tr v-if="expandedRows.has(entry.id)">
            <td colspan="6" class="px-5 py-3 bg-gray-900/40 border-t border-gray-800/40">
              <div class="grid grid-cols-3 gap-4 text-xs">
                <div>
                  <span class="text-gray-500">Session:</span>
                  <span class="ml-2 text-gray-400 font-mono">{{ entry.sessionId.slice(0, 12) }}...</span>
                </div>
                <div>
                  <span class="text-gray-500">Full timestamp:</span>
                  <span class="ml-2 text-gray-400">{{ formatDate(entry.timestamp) }}</span>
                </div>
                <div>
                  <span class="text-gray-500">Turn:</span>
                  <span class="ml-2 text-gray-400">{{ entry.turnIndex ?? "N/A" }} ({{ entry.role ?? "unknown" }})</span>
                </div>
              </div>
            </td>
          </tr>
        </template>
      </tbody>
    </table>
  </div>
</template>
