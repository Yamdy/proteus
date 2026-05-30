<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, shallowRef } from "vue";
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter } from "@codemirror/view";
import { EditorState, type Extension } from "@codemirror/state";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { javascript } from "@codemirror/lang-javascript";
import { typescriptLanguage } from "@codemirror/lang-javascript";
import { oneDark } from "@codemirror/theme-one-dark";
import { syntaxHighlighting, defaultHighlightStyle, bracketMatching, foldGutter, indentOnInput } from "@codemirror/language";
import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";

const props = defineProps<{
  modelValue: string;
  language?: "javascript" | "typescript";
  readonly?: boolean;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: string): void;
  (e: "save"): void;
}>();

const editorRef = ref<HTMLDivElement>();
const view = shallowRef<EditorView>();

function createExtensions(): Extension[] {
  const lang = props.language === "typescript" ? typescriptLanguage : javascript();

  const extensions: Extension[] = [
    lineNumbers(),
    highlightActiveLine(),
    highlightActiveLineGutter(),
    history(),
    bracketMatching(),
    closeBrackets(),
    indentOnInput(),
    foldGutter(),
    syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
    oneDark,
    lang,
    keymap.of([...defaultKeymap, ...historyKeymap, ...closeBracketsKeymap]),
    EditorView.theme({
      "&": {
        height: "100%",
        fontSize: "13px",
      },
      ".cm-scroller": {
        fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Consolas, monospace",
        overflow: "auto",
      },
      ".cm-content": {
        padding: "8px 0",
      },
      ".cm-gutters": {
        backgroundColor: "#1e1e2e",
        borderRight: "1px solid #2d2d3f",
        color: "#5c5c7a",
      },
      ".cm-activeLineGutter": {
        backgroundColor: "#262637",
      },
      ".cm-activeLine": {
        backgroundColor: "#1e1e2e88",
      },
    }),
  ];

  if (props.readonly) {
    extensions.push(EditorState.readOnly.of(true));
    extensions.push(EditorView.editable.of(false));
  } else {
    extensions.push(
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          emit("update:modelValue", update.state.doc.toString());
        }
      }),
    );
    // Ctrl+S / Cmd+S to save
    extensions.push(
      keymap.of([
        {
          key: "Mod-s",
          run: () => {
            emit("save");
            return true;
          },
        },
      ]),
    );
  }

  return extensions;
}

onMounted(() => {
  if (!editorRef.value) return;

  const state = EditorState.create({
    doc: props.modelValue,
    extensions: createExtensions(),
  });

  view.value = new EditorView({
    state,
    parent: editorRef.value,
  });
});

// Sync external value changes into the editor (e.g. loading a new file)
watch(
  () => props.modelValue,
  (newVal) => {
    if (!view.value) return;
    const current = view.value.state.doc.toString();
    if (current !== newVal) {
      view.value.dispatch({
        changes: { from: 0, to: current.length, insert: newVal },
      });
    }
  },
);

onUnmounted(() => {
  view.value?.destroy();
});
</script>

<template>
  <div ref="editorRef" class="h-full w-full overflow-hidden rounded-b-lg" />
</template>
