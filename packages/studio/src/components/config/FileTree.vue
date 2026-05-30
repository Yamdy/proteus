<script setup lang="ts">
import { computed } from "vue";

export interface FileEntry {
  path: string;
  label: string;
  extension?: string;
}

const props = defineProps<{
  files: FileEntry[];
  activePath?: string;
}>();

const emit = defineEmits<{
  (e: "select", path: string): void;
}>();

/** Group files by their top-level directory segment */
const grouped = computed(() => {
  const map = new Map<string, FileEntry[]>();
  for (const f of props.files) {
    const parts = f.path.split("/");
    const dir = parts.length > 1 ? parts[0] : "";
    if (!map.has(dir)) map.set(dir, []);
    map.get(dir)!.push(f);
  }
  return map;
});

function extIcon(ext?: string): string {
  switch (ext) {
    case "ts":
      return "TS";
    case "js":
      return "JS";
    case "json":
      return "{}";
    case "md":
      return "M";
    case "yaml":
    case "yml":
      return "Y";
    default:
      return " ";
  }
}

function extColor(ext?: string): string {
  switch (ext) {
    case "ts":
      return "text-blue-400 bg-blue-500/15";
    case "js":
      return "text-yellow-400 bg-yellow-500/15";
    case "json":
      return "text-emerald-400 bg-emerald-500/15";
    case "md":
      return "text-gray-400 bg-gray-500/15";
    case "yaml":
    case "yml":
      return "text-purple-400 bg-purple-500/15";
    default:
      return "text-gray-500 bg-gray-500/10";
  }
}
</script>

<template>
  <div class="h-full overflow-y-auto py-2">
    <div v-if="files.length === 0" class="px-4 py-8 text-center">
      <svg class="w-8 h-8 mx-auto text-gray-600 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1">
        <path stroke-linecap="round" stroke-linejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
      </svg>
      <p class="text-xs text-gray-500">No handler files found</p>
    </div>

    <template v-for="[dir, entries] in grouped" :key="dir">
      <!-- Directory header -->
      <div v-if="dir" class="px-3 pt-3 pb-1 flex items-center gap-1.5">
        <svg class="w-3.5 h-3.5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
        </svg>
        <span class="text-[10px] font-medium uppercase tracking-wider text-gray-500">{{ dir }}</span>
      </div>

      <!-- File entries -->
      <button
        v-for="file in entries"
        :key="file.path"
        @click="emit('select', file.path)"
        class="w-full flex items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors group"
        :class="
          activePath === file.path
            ? 'bg-blue-500/15 text-blue-300'
            : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/60'
        "
      >
        <span
          class="shrink-0 w-6 h-5 rounded text-[9px] font-bold flex items-center justify-center"
          :class="extColor(file.extension)"
        >
          {{ extIcon(file.extension) }}
        </span>
        <span class="truncate text-xs font-mono">{{ file.label }}</span>
      </button>
    </template>
  </div>
</template>
