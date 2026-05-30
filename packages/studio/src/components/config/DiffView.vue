<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, shallowRef } from "vue";
import { EditorView } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { MergeView } from "@codemirror/merge";
import { javascript } from "@codemirror/lang-javascript";
import { typescriptLanguage } from "@codemirror/lang-javascript";
import { oneDark } from "@codemirror/theme-one-dark";

const props = defineProps<{
  original: string;
  modified: string;
  language?: "javascript" | "typescript";
}>();

const containerRef = ref<HTMLDivElement>();
const mergeView = shallowRef<MergeView>();

function createMergeView() {
  if (!containerRef.value) return;
  mergeView.value?.destroy();

  const lang = props.language === "typescript" ? typescriptLanguage : javascript();

  mergeView.value = new MergeView({
    parent: containerRef.value,
    orientation: "a-b",
    a: {
      doc: props.original,
      extensions: [oneDark, lang, EditorState.readOnly.of(true), EditorView.editable.of(false)],
    },
    b: {
      doc: props.modified,
      extensions: [oneDark, lang, EditorState.readOnly.of(true), EditorView.editable.of(false)],
    },
    highlightChanges: true,
    gutter: true,
  });
}

onMounted(() => {
  createMergeView();
});

// Rebuild when content changes significantly (e.g. switching files)
watch(
  () => [props.original, props.modified],
  () => {
    createMergeView();
  },
);

onUnmounted(() => {
  mergeView.value?.destroy();
});
</script>

<template>
  <div class="h-full flex flex-col">
    <!-- Legend bar -->
    <div class="shrink-0 flex items-center gap-4 px-4 py-2 border-b border-gray-800 bg-gray-900/80 text-[10px] uppercase tracking-wider">
      <span class="text-gray-500 flex items-center gap-1.5">
        <span class="w-2.5 h-2.5 rounded-sm bg-red-500/40 border border-red-500/60"></span>
        Original
      </span>
      <span class="text-gray-500 flex items-center gap-1.5">
        <span class="w-2.5 h-2.5 rounded-sm bg-emerald-500/40 border border-emerald-500/60"></span>
        Modified
      </span>
    </div>
    <div ref="containerRef" class="flex-1 overflow-hidden" />
  </div>
</template>
