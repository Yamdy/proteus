<script setup lang="ts">
import { ref, watch, nextTick } from "vue";

const props = defineProps<{
  disabled?: boolean;
}>();

const emit = defineEmits<{
  send: [text: string];
}>();

const input = ref("");
const textareaRef = ref<HTMLTextAreaElement | null>(null);

function autoResize() {
  const el = textareaRef.value;
  if (!el) return;
  el.style.height = "auto";
  el.style.height = Math.min(el.scrollHeight, 160) + "px";
}

watch(input, () => {
  nextTick(autoResize);
});

function handleKeydown(e: KeyboardEvent) {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    send();
  }
}

function send() {
  const text = input.value.trim();
  if (!text || props.disabled) return;
  emit("send", text);
  input.value = "";
  nextTick(() => {
    if (textareaRef.value) {
      textareaRef.value.style.height = "auto";
    }
  });
}
</script>

<template>
  <div class="shrink-0 border-t border-gray-800 bg-gray-900/50 backdrop-blur-sm px-4 py-3">
    <div class="max-w-3xl mx-auto">
      <div class="flex gap-2 items-end">
        <textarea
          ref="textareaRef"
          v-model="input"
          @keydown="handleKeydown"
          placeholder="Type a message..."
          rows="1"
          :disabled="disabled"
          class="flex-1 resize-none bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/25 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          style="max-height: 160px"
        />
        <button
          @click="send"
          :disabled="!input.trim() || disabled"
          class="shrink-0 p-2.5 rounded-xl bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          aria-label="Send message"
        >
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
          </svg>
        </button>
      </div>
      <p class="mt-1.5 text-[10px] text-gray-600 text-right">
        Enter to send, Shift+Enter for newline
      </p>
    </div>
  </div>
</template>
