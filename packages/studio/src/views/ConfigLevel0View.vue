<script setup lang="ts">
import { onMounted, ref, computed } from "vue";
import { useConfig } from "../composables/useConfig";
import type { Level0FormData } from "../composables/useConfig";
import { useConfigStore } from "../stores/configStore";
import Level0Form from "../components/config/Level0Form.vue";

const {
  loading,
  error,
  fetchConfig,
  saveLevel0,
  parseLevel0,
  defaults,
} = useConfig();

const configStore = useConfigStore();

const formRef = ref<InstanceType<typeof Level0Form> | null>(null);

const formData = computed<Level0FormData>(() => {
  try {
    return parseLevel0(configStore.level0);
  } catch {
    return defaults();
  }
});

async function handleSave(data: Level0FormData) {
  const ok = await saveLevel0(data);
  if (ok) {
    formRef.value?.markSaved();
  }
}

onMounted(() => {
  fetchConfig();
});
</script>

<template>
  <div class="max-w-3xl mx-auto px-6 py-8">
    <!-- Header -->
    <div class="mb-8">
      <div class="flex items-center gap-2 mb-1">
        <span
          class="text-[10px] font-mono uppercase tracking-widest text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded"
        >
          Level 0
        </span>
      </div>
      <h1 class="text-2xl font-semibold text-gray-100">Static Configuration</h1>
      <p class="mt-1 text-sm text-gray-500">
        Model, temperature, tools, and log level. Changes require a restart to take effect.
      </p>
    </div>

    <!-- Loading -->
    <div
      v-if="loading"
      class="flex items-center gap-2 text-gray-400 text-sm"
    >
      <svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
      Loading configuration...
    </div>

    <!-- Error -->
    <div
      v-else-if="error"
      class="rounded-lg bg-red-900/20 border border-red-800/40 px-4 py-3 text-sm text-red-300"
    >
      {{ error }}
    </div>

    <!-- Form -->
    <div
      v-else
      class="rounded-lg border border-gray-800 bg-gray-900/50 p-6"
    >
      <Level0Form
        ref="formRef"
        :initial="formData"
        @save="handleSave"
      />
    </div>
  </div>
</template>
