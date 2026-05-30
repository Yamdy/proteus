<script setup lang="ts">

import { useSelfModifyStore, type SelfModifyEntry } from "../../stores/selfModifyStore";

const store = useSelfModifyStore();

const emit = defineEmits<{
  (e: "select", id: string): void;
}>();

function formatTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return `${diffD}d ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function actionLabel(action: string): string {
  const labels: Record<string, string> = {
    register: "registered",
    replace: "replaced",
    unregister: "removed",
  };
  return labels[action] ?? action;
}

function actionColor(action: string): string {
  const colors: Record<string, string> = {
    register: "text-emerald-400",
    replace: "text-amber-400",
    unregister: "text-red-400",
  };
  return colors[action] ?? "text-gray-400";
}

function statusIcon(status: string): string {
  if (status === "rolled_back") return "reverted";
  if (status === "error") return "failed";
  return "";
}

function handleSelect(entry: SelfModifyEntry) {
  store.selectEntry(entry.id);
  emit("select", entry.id);
}

const actionFilters = [
  { value: "all" as const, label: "All" },
  { value: "register" as const, label: "Register" },
  { value: "replace" as const, label: "Replace" },
  { value: "unregister" as const, label: "Remove" },
];

const timeFilters = [
  { value: "all" as const, label: "All time" },
  { value: "1h" as const, label: "1 hour" },
  { value: "24h" as const, label: "24 hours" },
  { value: "7d" as const, label: "7 days" },
];
</script>

<template>
  <div class="flex flex-col h-full">
    <!-- Filters bar -->
    <div class="px-4 py-3 border-b border-gray-800 space-y-2.5 shrink-0">
      <!-- Search -->
      <div class="relative">
        <svg
          class="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500 pointer-events-none"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          stroke-width="2"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
          />
        </svg>
        <input
          v-model="store.searchQuery"
          type="text"
          placeholder="Search handlers..."
          class="w-full pl-8 pr-3 py-1.5 text-xs bg-gray-900 border border-gray-700 rounded-md text-gray-300 placeholder-gray-600 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-colors"
        />
      </div>

      <!-- Action filter pills -->
      <div class="flex gap-1.5 flex-wrap">
        <button
          v-for="f in actionFilters"
          :key="f.value"
          @click="store.filterAction = f.value"
          class="px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider rounded transition-colors"
          :class="
            store.filterAction === f.value
              ? 'bg-blue-500/15 text-blue-400 border border-blue-500/30'
              : 'text-gray-500 border border-gray-800 hover:text-gray-300 hover:border-gray-700'
          "
        >
          {{ f.label }}
        </button>
      </div>

      <!-- Time filter -->
      <div class="flex gap-1.5">
        <button
          v-for="f in timeFilters"
          :key="f.value"
          @click="store.filterTime = f.value"
          class="px-2 py-0.5 text-[10px] rounded transition-colors"
          :class="
            store.filterTime === f.value
              ? 'bg-gray-700 text-gray-200'
              : 'text-gray-600 hover:text-gray-400'
          "
        >
          {{ f.label }}
        </button>
      </div>
    </div>

    <!-- Entry list — timeline style -->
    <div class="flex-1 overflow-y-auto">
      <div v-if="store.loading" class="flex items-center justify-center py-12">
        <svg class="w-5 h-5 animate-spin text-gray-500" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>

      <div
        v-else-if="store.filteredEntries.length === 0"
        class="px-4 py-10 text-center"
      >
        <p class="text-xs text-gray-500">No modifications found</p>
      </div>

      <div v-else class="relative">
        <!-- Vertical timeline line -->
        <div class="absolute left-[19px] top-0 bottom-0 w-px bg-gray-800" />

        <div
          v-for="entry in store.filteredEntries"
          :key="entry.id"
          class="relative flex items-start gap-3 px-3 py-2.5 cursor-pointer transition-colors group"
          :class="
            store.selectedEntryId === entry.id
              ? 'bg-gray-800 border-l-2 border-blue-500'
              : 'hover:bg-gray-900/60 border-l-2 border-transparent'
          "
          @click="handleSelect(entry)"
        >
          <!-- Timeline dot -->
          <div class="relative z-10 shrink-0 mt-0.5">
            <div
              class="w-[9px] h-[9px] rounded-full border-2"
              :class="{
                'bg-emerald-400 border-emerald-400': entry.action === 'register' && entry.status === 'success',
                'bg-amber-400 border-amber-400': entry.action === 'replace' && entry.status === 'success',
                'bg-red-400 border-red-400': entry.action === 'unregister' && entry.status === 'success',
                'bg-gray-500 border-gray-500': entry.status === 'rolled_back',
                'bg-red-600 border-red-600': entry.status === 'error',
              }"
            />
          </div>

          <!-- Entry content -->
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-1.5">
              <span
                class="text-[10px] font-medium uppercase tracking-wider"
                :class="actionColor(entry.action)"
              >
                {{ actionLabel(entry.action) }}
              </span>
              <span class="text-xs font-mono text-gray-300 truncate">
                {{ entry.handlerName }}
              </span>
              <span
                v-if="statusIcon(entry.status)"
                class="text-[9px] uppercase tracking-wider text-gray-500 ml-auto shrink-0"
              >
                {{ statusIcon(entry.status) }}
              </span>
            </div>
            <p
              v-if="entry.description"
              class="text-[11px] text-gray-500 truncate mt-0.5"
            >
              {{ entry.description }}
            </p>
            <span class="text-[10px] text-gray-600 mt-0.5 block">
              {{ formatTime(entry.timestamp) }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- Count footer -->
    <div class="px-4 py-2 border-t border-gray-800 text-[10px] text-gray-600 shrink-0">
      {{ store.filteredEntries.length }} of {{ store.entries.length }} entries
    </div>
  </div>
</template>
