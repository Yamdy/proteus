<script setup lang="ts">
import { computed } from "vue";
import { marked } from "marked";
import hljs from "highlight.js";
import type { ChatMessage } from "../../composables/useChat";

const props = defineProps<{
  message: ChatMessage;
}>();

// Configure marked with highlight.js for code blocks
marked.setOptions({
  breaks: true,
  gfm: true,
});

const renderer = new marked.Renderer();

renderer.code = function ({ text, lang }: { text: string; lang?: string }) {
  const language = lang && hljs.getLanguage(lang) ? lang : "plaintext";
  let highlighted: string;
  try {
    highlighted = hljs.highlight(text, { language }).value;
  } catch {
    highlighted = hljs.highlightAuto(text).value;
  }
  return `<pre class="hljs-code-block"><code class="hljs language-${language}">${highlighted}</code></pre>`;
};

marked.use({ renderer });

const renderedContent = computed(() => {
  if (props.message.role === "system") return escapeHtml(props.message.content);
  // For user messages, also escape — they're shown as plain text
  if (props.message.role === "user") return escapeHtml(props.message.content);
  // Assistant messages get markdown rendering
  try {
    return marked.parse(props.message.content) as string;
  } catch {
    return escapeHtml(props.message.content);
  }
});

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/\n/g, "<br>");
}

const showCursor = computed(() => props.message.streaming === true);
</script>

<template>
  <div
    class="flex"
    :class="message.role === 'user' ? 'justify-end' : 'justify-start'"
  >
    <div
      class="rounded-2xl px-4 py-2.5 text-sm leading-relaxed"
      :class="{
        'bg-blue-600 text-white ml-auto max-w-[70%]': message.role === 'user',
        'bg-gray-800 text-gray-200 mr-auto max-w-[80%]': message.role === 'assistant',
        'bg-red-900/40 text-red-300 border border-red-800/50 mr-auto max-w-[80%]': message.role === 'system',
      }"
    >
      <!-- User messages: plain text -->
      <div v-if="message.role === 'user'" class="whitespace-pre-wrap font-sans">
        {{ message.content }}
      </div>

      <!-- System messages: plain text -->
      <div v-else-if="message.role === 'system'" class="whitespace-pre-wrap font-sans">
        {{ message.content }}
      </div>

      <!-- Assistant messages: rendered markdown -->
      <div
        v-else
        class="prose-chat"
        v-html="renderedContent"
      />

      <!-- Streaming cursor -->
      <span
        v-if="showCursor"
        class="inline-block w-1.5 h-4 bg-gray-400 ml-0.5 animate-pulse align-text-bottom"
      />
    </div>
  </div>
</template>

<style scoped>
.prose-chat :deep(h1),
.prose-chat :deep(h2),
.prose-chat :deep(h3),
.prose-chat :deep(h4) {
  font-weight: 600;
  margin-top: 0.75rem;
  margin-bottom: 0.25rem;
  color: #e5e7eb;
}

.prose-chat :deep(h1) { font-size: 1.25rem; }
.prose-chat :deep(h2) { font-size: 1.125rem; }
.prose-chat :deep(h3) { font-size: 1rem; }

.prose-chat :deep(p) {
  margin-bottom: 0.5rem;
}

.prose-chat :deep(p:last-child) {
  margin-bottom: 0;
}

.prose-chat :deep(ul),
.prose-chat :deep(ol) {
  margin-left: 1.25rem;
  margin-bottom: 0.5rem;
}

.prose-chat :deep(li) {
  margin-bottom: 0.25rem;
}

.prose-chat :deep(code:not(.hljs)) {
  background: rgba(255, 255, 255, 0.08);
  padding: 0.125rem 0.375rem;
  border-radius: 0.25rem;
  font-size: 0.85em;
  color: #f3f4f6;
}

.prose-chat :deep(.hljs-code-block) {
  background: #111827;
  border-radius: 0.5rem;
  padding: 0.75rem 1rem;
  margin: 0.5rem 0;
  overflow-x: auto;
  font-size: 0.8125rem;
  line-height: 1.5;
}

.prose-chat :deep(.hljs-code-block code) {
  font-family: "JetBrains Mono", "Fira Code", ui-monospace, monospace;
  background: transparent;
  padding: 0;
  border-radius: 0;
}

.prose-chat :deep(blockquote) {
  border-left: 3px solid #4b5563;
  padding-left: 0.75rem;
  margin: 0.5rem 0;
  color: #9ca3af;
}

.prose-chat :deep(a) {
  color: #60a5fa;
  text-decoration: underline;
}

.prose-chat :deep(table) {
  border-collapse: collapse;
  margin: 0.5rem 0;
  font-size: 0.875rem;
}

.prose-chat :deep(th),
.prose-chat :deep(td) {
  border: 1px solid #374151;
  padding: 0.375rem 0.625rem;
}

.prose-chat :deep(th) {
  background: rgba(255, 255, 255, 0.04);
  font-weight: 600;
}

.prose-chat :deep(hr) {
  border: none;
  border-top: 1px solid #374151;
  margin: 0.75rem 0;
}
</style>
