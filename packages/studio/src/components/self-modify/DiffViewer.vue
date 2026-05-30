<script setup lang="ts">
import { computed } from "vue";
import type { DiffBlock } from "../../stores/selfModifyStore";

const props = defineProps<{
  blocks: DiffBlock[];
  title?: string;
}>();

const stats = computed(() => {
  let added = 0;
  let removed = 0;
  for (const b of props.blocks) {
    if (b.type === "add") added++;
    if (b.type === "remove") removed++;
  }
  return { added, removed };
});

const hasChanges = computed(() => stats.value.added > 0 || stats.value.removed > 0);

function lineClass(type: string): string {
  if (type === "add")
    return "bg-emerald-900/20 text-emerald-300 border-l-2 border-emerald-500/40";
  if (type === "remove")
    return "bg-red-900/20 text-red-300 border-l-2 border-red-500/40";
  return "text-gray-500";
}

function prefix(type: string): string {
  if (type === "add") return "+";
  if (type === "remove") return "-";
  return " ";
}
</script>

<template>
  <div class="flex flex-col h-full">
    <!-- Header -->
    <div class="px-4 py-3 border-b border-gray-800 flex items-center gap-3 shrink-0">
      <h3 class="text-xs font-medium text-gray-300 truncate">
        {{ title ?? "Diff" }}
      </h3>
      <div v-if="hasChanges" class="flex items-center gap-2 ml-auto shrink-0">
        <span class="text-[10px] font-mono text-emerald-400">+{{ stats.added }}</span>
        <span class="text-[10px] font-mono text-red-400">-{{ stats.removed }}</span>
      </div>
    </div>

    <!-- Diff content -->
    <div class="flex-1 overflow-auto">
      <div v-if="blocks.length === 0" class="flex items-center justify-center h-full">
        <p class="text-xs text-gray-600">No diff available</p>
      </div>

      <table v-else class="w-full text-xs font-mono leading-relaxed">
        <tbody>
          <tr
            v-for="(block, i) in blocks"
            :key="i"
            :class="lineClass(block.type)"
          >
            <!-- Old line number -->
            <td class="w-10 text-right pr-2 py-0.5 select-none text-gray-700 border-r border-gray-800/50 shrink-0">
              {{ block.oldLine ?? "" }}
            </td>
            <!-- New line number -->
            <td class="w-10 text-right pr-2 py-0.5 select-none text-gray-700 border-r border-gray-800/50 shrink-0">
              {{ block.newLine ?? "" }}
            </td>
            <!-- Prefix (+/-/space) -->
            <td class="w-5 text-center py-0.5 select-none shrink-0" :class="{
              'text-emerald-500': block.type === 'add',
              'text-red-500': block.type === 'remove',
              'text-gray-700': block.type === 'context',
            }">
              {{ prefix(block.type) }}
            </td>
            <!-- Content -->
            <td class="py-0.5 pl-1 pr-4 whitespace-pre overflow-hidden text-ellipsis">
              {{ block.content }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
