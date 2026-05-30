<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useConfigStore } from "../../stores/configStore";
import type { HandlerNode, TrustLevel } from "../../stores/configStore";

const configStore = useConfigStore();

const selectedHandler = computed<HandlerNode | undefined>(() =>
  configStore.level1.handlers.find(
    (h) => h.id === configStore.selectedHandlerId
  )
);

// Local editing state
const editName = ref("");
const editPriority = ref(0);
const editTrust = ref<TrustLevel>("medium");
const editEvents = ref("");
const editPromptTemplate = ref("");
const editVariableBindings = ref("");

// Autocomplete state
const showAutocomplete = ref(false);
const autocompleteFilter = ref("");
const autocompletePos = ref({ top: 0, left: 0 });
const autocompleteVarName = ref("");

const knownVariables = [
  "user_input",
  "context",
  "history",
  "tool_results",
  "system_prompt",
  "model_name",
  "temperature",
  "max_tokens",
  "session_id",
  "timestamp",
];

const filteredVariables = computed(() => {
  const filter = autocompleteFilter.value.toLowerCase();
  return knownVariables.filter(
    (v) =>
      v.toLowerCase().includes(filter) &&
      v !== autocompleteVarName.value
  );
});

// Sync local state when selection changes
watch(
  selectedHandler,
  (handler) => {
    if (handler) {
      editName.value = handler.name;
      editPriority.value = handler.priority;
      editTrust.value = handler.trust;
      editEvents.value = handler.events.join(", ");
      editPromptTemplate.value = handler.promptTemplate;
      editVariableBindings.value = Object.entries(handler.variableBindings)
        .map(([k, v]) => `${k}: ${v}`)
        .join("\n");
    }
  },
  { immediate: true }
);

function commitUpdate() {
  if (!selectedHandler.value) return;
  const bindings: Record<string, string> = {};
  for (const line of editVariableBindings.value.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const colonIdx = trimmed.indexOf(":");
    if (colonIdx === -1) continue;
    const key = trimmed.slice(0, colonIdx).trim();
    const val = trimmed.slice(colonIdx + 1).trim();
    if (key) bindings[key] = val;
  }
  configStore.updateHandler(selectedHandler.value.id, {
    name: editName.value,
    priority: editPriority.value,
    trust: editTrust.value,
    events: editEvents.value
      .split(",")
      .map((e) => e.trim())
      .filter(Boolean),
    promptTemplate: editPromptTemplate.value,
    variableBindings: bindings,
  });
}

function removeSelected() {
  if (!selectedHandler.value) return;
  configStore.removeHandler(selectedHandler.value.id);
  configStore.selectHandler(null);
}

// Handle {{var}} autocomplete in prompt template
function onPromptInput(e: Event) {
  const textarea = e.target as HTMLTextAreaEditElement;
  editPromptTemplate.value = textarea.value;

  // Detect {{ pattern
  const cursorPos = textarea.selectionStart;
  const textBefore = textarea.value.slice(0, cursorPos);
  const match = textBefore.match(/\{\{([^}]*)$/);

  if (match) {
    autocompleteFilter.value = match[1];
    autocompleteVarName.value = match[0];
    // Calculate position for dropdown
    const lines = textBefore.split("\n");
    const lineHeight = 20;
    autocompletePos.value = {
      top: lines.length * lineHeight + 4,
      left: 12,
    };
    showAutocomplete.value = true;
  } else {
    showAutocomplete.value = false;
  }
}

function insertVariable(varName: string) {
  const textarea = document.querySelector(
    "#prompt-textarea"
  ) as HTMLTextAreaElement | null;
  if (!textarea) return;

  const cursorPos = textarea.selectionStart;
  const textBefore = editPromptTemplate.value.slice(0, cursorPos);
  const textAfter = editPromptTemplate.value.slice(cursorPos);

  // Replace incomplete {{ with completed {{var}}
  const newBefore = textBefore.replace(/\{\{[^}]*$/, "");
  editPromptTemplate.value = `${newBefore}{{${varName}}}${textAfter}`;

  showAutocomplete.value = false;

  // Restore focus
  setTimeout(() => {
    textarea.focus();
    const newPos = newBefore.length + varName.length + 4;
    textarea.setSelectionRange(newPos, newPos);
  }, 0);
}

type HTMLTextAreaEditElement = HTMLTextAreaElement;
</script>

<template>
  <div class="flex flex-col h-full">
    <div class="px-4 py-3 border-b border-gray-800">
      <h3 class="text-xs font-semibold uppercase tracking-wider text-gray-400">
        Handler Detail
      </h3>
    </div>

    <div v-if="!selectedHandler" class="flex-1 flex items-center justify-center px-4">
      <p class="text-sm text-gray-600 text-center">
        Select a handler node to edit its properties
      </p>
    </div>

    <div v-else class="flex-1 overflow-y-auto px-4 py-3 space-y-4">
      <!-- Name -->
      <div>
        <label class="block text-[11px] font-medium text-gray-400 mb-1">Name</label>
        <input
          v-model="editName"
          @change="commitUpdate"
          type="text"
          class="w-full bg-gray-800 border border-gray-700 rounded px-2.5 py-1.5 text-sm text-gray-100 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/25 transition-colors font-mono"
        />
      </div>

      <!-- Priority -->
      <div>
        <label class="block text-[11px] font-medium text-gray-400 mb-1">Priority</label>
        <input
          v-model.number="editPriority"
          @change="commitUpdate"
          type="number"
          min="0"
          max="1000"
          class="w-full bg-gray-800 border border-gray-700 rounded px-2.5 py-1.5 text-sm text-gray-100 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/25 transition-colors font-mono"
        />
      </div>

      <!-- Trust -->
      <div>
        <label class="block text-[11px] font-medium text-gray-400 mb-1">Trust Level</label>
        <div class="flex gap-1.5">
          <button
            v-for="level in ['low', 'medium', 'high'] as TrustLevel[]"
            :key="level"
            @click="
              editTrust = level;
              commitUpdate();
            "
            class="flex-1 px-2 py-1.5 text-xs font-medium rounded transition-all duration-150"
            :class="
              editTrust === level
                ? level === 'low'
                  ? 'bg-red-500/20 text-red-400 border border-red-500/40'
                  : level === 'medium'
                    ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/40'
                    : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                : 'bg-gray-800 text-gray-500 border border-gray-700 hover:border-gray-600'
            "
          >
            {{ level }}
          </button>
        </div>
      </div>

      <!-- Events -->
      <div>
        <label class="block text-[11px] font-medium text-gray-400 mb-1"
          >Events (comma-separated)</label
        >
        <input
          v-model="editEvents"
          @change="commitUpdate"
          type="text"
          class="w-full bg-gray-800 border border-gray-700 rounded px-2.5 py-1.5 text-sm text-gray-100 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/25 transition-colors font-mono"
          placeholder="user.message, context.ready"
        />
      </div>

      <!-- Prompt Template -->
      <div class="relative">
        <label class="block text-[11px] font-medium text-gray-400 mb-1"
          >Prompt Template</label
        >
        <textarea
          id="prompt-textarea"
          :value="editPromptTemplate"
          @input="onPromptInput"
          @change="commitUpdate"
          rows="5"
          class="w-full bg-gray-800 border border-gray-700 rounded px-2.5 py-1.5 text-sm text-gray-100 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/25 transition-colors resize-y font-mono"
          placeholder="Process {{user_input}} with context {{context}}"
        />
        <!-- Autocomplete dropdown -->
        <div
          v-if="showAutocomplete && filteredVariables.length > 0"
          class="absolute z-10 bg-gray-800 border border-gray-700 rounded-md shadow-lg py-1 max-h-40 overflow-y-auto"
          :style="{ top: autocompletePos.top + 'px', left: autocompletePos.left + 'px' }"
        >
          <button
            v-for="varName in filteredVariables"
            :key="varName"
            @mousedown.prevent="insertVariable(varName)"
            class="w-full text-left px-3 py-1.5 text-xs font-mono text-gray-300 hover:bg-blue-500/20 hover:text-blue-300 transition-colors"
          >
            <span class="text-gray-600" v-text="'{{'"></span><span v-text="varName"></span><span class="text-gray-600" v-text="'}}'"></span>
          </button>
        </div>
      </div>

      <!-- Variable Bindings -->
      <div>
        <label class="block text-[11px] font-medium text-gray-400 mb-1"
          >Variable Bindings (key: value per line)</label
        >
        <textarea
          v-model="editVariableBindings"
          @change="commitUpdate"
          rows="3"
          class="w-full bg-gray-800 border border-gray-700 rounded px-2.5 py-1.5 text-sm text-gray-100 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/25 transition-colors resize-y font-mono"
          placeholder="user_input: lastMessage&#10;context: conversationHistory"
        />
      </div>

      <!-- Delete -->
      <div class="pt-2">
        <button
          @click="removeSelected"
          class="w-full px-3 py-2 text-xs font-medium rounded bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 hover:border-red-500/40 transition-colors"
        >
          Remove Handler
        </button>
      </div>
    </div>
  </div>
</template>
