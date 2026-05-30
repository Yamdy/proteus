<script setup lang="ts">
import { ref, reactive, watch, computed } from "vue";
import type { Level0FormData } from "../../composables/useConfig";
import { useConfig } from "../../composables/useConfig";

const { AVAILABLE_MODELS, AVAILABLE_TOOLS, LOG_LEVELS } =
  useConfig();

const props = defineProps<{
  initial: Level0FormData;
}>();

const emit = defineEmits<{
  (e: "save", data: Level0FormData): void;
}>();

/* ── form state ── */
const form = reactive<Level0FormData>({ ...props.initial });
const jsonMode = ref(false);
const jsonText = ref("");
const jsonError = ref<string | null>(null);
const saving = ref(false);
const saved = ref(false);

/* ── validation ── */
interface FieldErrors {
  model: string | null;
  temperature: string | null;
  tools: string | null;
  logLevel: string | null;
}

const errors = reactive<FieldErrors>({
  model: null,
  temperature: null,
  tools: null,
  logLevel: null,
});

function validate(): boolean {
  let ok = true;

  // model
  if (!form.model.trim()) {
    errors.model = "Model is required";
    ok = false;
  } else if (form.model.trim().length < 2) {
    errors.model = "Model name too short";
    ok = false;
  } else {
    errors.model = null;
  }

  // temperature
  if (form.temperature < 0 || form.temperature > 2) {
    errors.temperature = "Must be between 0 and 2";
    ok = false;
  } else if (Number.isNaN(form.temperature)) {
    errors.temperature = "Must be a number";
    ok = false;
  } else {
    errors.temperature = null;
  }

  // tools
  if (form.tools.length === 0) {
    errors.tools = "Select at least one tool";
    ok = false;
  } else {
    errors.tools = null;
  }

  // logLevel
  if (
    !(LOG_LEVELS as readonly string[]).includes(form.logLevel)
  ) {
    errors.logLevel = "Invalid log level";
    ok = false;
  } else {
    errors.logLevel = null;
  }

  return ok;
}

const hasErrors = computed(
  () => errors.model || errors.temperature || errors.tools || errors.logLevel,
);

/* ── temperature slider ── */
const tempPercent = computed(
  () => ((form.temperature / 2) * 100).toFixed(0) + "%",
);

/* ── tools toggle ── */
function toggleTool(tool: string) {
  const idx = form.tools.indexOf(tool);
  if (idx === -1) {
    form.tools.push(tool);
  } else {
    form.tools.splice(idx, 1);
  }
}

/* ── JSON mode ── */
function enterJsonMode() {
  jsonText.value = JSON.stringify(form, null, 2);
  jsonError.value = null;
  jsonMode.value = true;
}

function exitFormMode() {
  try {
    const parsed = JSON.parse(jsonText.value) as Partial<Level0FormData>;
    if (typeof parsed.model === "string") form.model = parsed.model;
    if (typeof parsed.temperature === "number")
      form.temperature = parsed.temperature;
    if (Array.isArray(parsed.tools)) form.tools = parsed.tools;
    if (
      typeof parsed.logLevel === "string" &&
      (LOG_LEVELS as readonly string[]).includes(parsed.logLevel)
    )
      form.logLevel = parsed.logLevel as Level0FormData["logLevel"];
    jsonError.value = null;
    jsonMode.value = false;
  } catch {
    jsonError.value = "Invalid JSON";
  }
}

function cancelJson() {
  jsonError.value = null;
  jsonMode.value = false;
}

/* ── save ── */
async function handleSave() {
  if (!validate()) return;
  saving.value = true;
  saved.value = false;
  emit("save", { ...form });
  saving.value = false;
}

/* ── reset feedback on edit ── */
watch(
  () => [form.model, form.temperature, form.tools.length, form.logLevel],
  () => {
    saved.value = false;
  },
);

/* ── re-init when initial changes ── */
watch(
  () => props.initial,
  (v) => {
    Object.assign(form, v);
    saved.value = false;
  },
  { deep: true },
);

/* expose for parent to mark saved */
function markSaved() {
  saved.value = true;
}

defineExpose({ markSaved });
</script>

<template>
  <div class="space-y-6">
    <!-- JSON toggle bar -->
    <div class="flex items-center justify-between">
      <span class="text-xs text-gray-500 font-mono">
        {{ jsonMode ? "Editing raw JSON" : "Form editor" }}
      </span>
      <button
        v-if="!jsonMode"
        @click="enterJsonMode"
        type="button"
        class="text-xs px-3 py-1 rounded-md border border-gray-700 text-gray-400 hover:text-gray-200 hover:border-gray-600 transition-colors"
      >
        {"{}"} JSON
      </button>
      <div v-else class="flex gap-2">
        <button
          @click="cancelJson"
          type="button"
          class="text-xs px-3 py-1 rounded-md border border-gray-700 text-gray-400 hover:text-gray-200 transition-colors"
        >
          Cancel
        </button>
        <button
          @click="exitFormMode"
          type="button"
          class="text-xs px-3 py-1 rounded-md bg-gray-700 text-gray-200 hover:bg-gray-600 transition-colors"
        >
          Apply JSON
        </button>
      </div>
    </div>

    <!-- JSON error -->
    <div
      v-if="jsonError"
      class="text-sm text-red-400 bg-red-900/20 border border-red-800/40 rounded-lg px-4 py-2"
    >
      {{ jsonError }}
    </div>

    <!-- JSON editor -->
    <div v-if="jsonMode">
      <textarea
        v-model="jsonText"
        rows="18"
        spellcheck="false"
        class="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-sm text-gray-200 font-mono leading-relaxed placeholder-gray-600 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/25 transition-colors resize-y"
      />
    </div>

    <!-- Form fields -->
    <div v-else class="space-y-6">
      <!-- Model -->
      <div class="space-y-1.5">
        <label class="block text-sm font-medium text-gray-300">Model</label>
        <div class="flex gap-2">
          <input
            v-model="form.model"
            type="text"
            placeholder="e.g. claude-sonnet-4-20250514"
            class="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/25 transition-colors"
            :class="errors.model ? 'border-red-500/60' : ''"
          />
          <select
            v-model="form.model"
            class="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-300 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/25 transition-colors cursor-pointer"
            :class="errors.model ? 'border-red-500/60' : ''"
          >
            <option value="" disabled>Quick pick...</option>
            <option v-for="m in AVAILABLE_MODELS" :key="m" :value="m">
              {{ m }}
            </option>
          </select>
        </div>
        <p v-if="errors.model" class="text-xs text-red-400 mt-1">
          {{ errors.model }}
        </p>
      </div>

      <!-- Temperature -->
      <div class="space-y-1.5">
        <div class="flex items-center justify-between">
          <label class="text-sm font-medium text-gray-300">Temperature</label>
          <span class="text-sm font-mono text-gray-400 tabular-nums">{{
            form.temperature.toFixed(2)
          }}</span>
        </div>
        <div class="relative">
          <input
            v-model.number="form.temperature"
            type="range"
            min="0"
            max="2"
            step="0.01"
            class="w-full h-2 rounded-full appearance-none cursor-pointer bg-gray-700 accent-blue-500"
            :style="{
              background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${tempPercent}, #374151 ${tempPercent}, #374151 100%)`,
            }"
          />
          <div class="flex justify-between text-[10px] text-gray-600 mt-1 px-0.5">
            <span>0 (deterministic)</span>
            <span>1</span>
            <span>2 (max creativity)</span>
          </div>
        </div>
        <p v-if="errors.temperature" class="text-xs text-red-400 mt-1">
          {{ errors.temperature }}
        </p>
      </div>

      <!-- Tools -->
      <div class="space-y-1.5">
        <label class="block text-sm font-medium text-gray-300">Tools</label>
        <p class="text-xs text-gray-500 mb-2">
          Select the tools available to the agent at Level 0
        </p>
        <div class="grid grid-cols-2 gap-2">
          <button
            v-for="tool in AVAILABLE_TOOLS"
            :key="tool"
            type="button"
            @click="toggleTool(tool)"
            class="flex items-center gap-2.5 px-3 py-2.5 rounded-lg border text-sm text-left transition-colors"
            :class="
              form.tools.includes(tool)
                ? 'bg-blue-500/10 border-blue-500/40 text-blue-300'
                : 'bg-gray-800/60 border-gray-700 text-gray-400 hover:border-gray-600 hover:text-gray-300'
            "
          >
            <!-- Checkbox indicator -->
            <span
              class="flex items-center justify-center w-4 h-4 rounded border shrink-0 transition-colors"
              :class="
                form.tools.includes(tool)
                  ? 'bg-blue-500 border-blue-500'
                  : 'border-gray-600 bg-gray-800'
              "
            >
              <svg
                v-if="form.tools.includes(tool)"
                class="w-3 h-3 text-white"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                stroke-width="3"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </span>
            <span class="font-mono text-xs">{{ tool }}</span>
          </button>
        </div>
        <p v-if="errors.tools" class="text-xs text-red-400 mt-1">
          {{ errors.tools }}
        </p>
      </div>

      <!-- Log Level -->
      <div class="space-y-1.5">
        <label class="block text-sm font-medium text-gray-300">Log Level</label>
        <select
          v-model="form.logLevel"
          class="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/25 transition-colors cursor-pointer"
          :class="errors.logLevel ? 'border-red-500/60' : ''"
        >
          <option v-for="lv in LOG_LEVELS" :key="lv" :value="lv">
            {{ lv }}
          </option>
        </select>
        <p v-if="errors.logLevel" class="text-xs text-red-400 mt-1">
          {{ errors.logLevel }}
        </p>
      </div>
    </div>

    <!-- Footer: validation summary + save -->
    <div class="flex items-center justify-between pt-2 border-t border-gray-800">
      <div>
        <span v-if="hasErrors && !jsonMode" class="text-xs text-red-400">
          Fix validation errors before saving
        </span>
        <span v-else-if="saved" class="text-xs text-emerald-400">
          Saved
        </span>
      </div>
      <button
        v-if="!jsonMode"
        @click="handleSave"
        :disabled="saving"
        class="px-5 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        <span v-if="saving" class="flex items-center gap-2">
          <svg class="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Saving...
        </span>
        <span v-else>Save Level 0 Config</span>
      </button>
    </div>
  </div>
</template>
