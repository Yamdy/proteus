<script setup lang="ts">
import { ref, onMounted } from "vue";

const emit = defineEmits<{
  (e: "close"): void;
  (e: "saved"): void;
}>();

const jaegerUrl = ref("");
const grafanaUrl = ref("");
const savedFlash = ref(false);

// Connection test state
const testing = ref<"idle" | "jaeger" | "grafana" | "both">("idle");
const testResults = ref<Record<string, "ok" | "fail" | null>>({
  jaeger: null,
  grafana: null,
});

onMounted(() => {
  jaegerUrl.value = localStorage.getItem("otel.jaegerUrl") || "http://localhost:16686";
  grafanaUrl.value = localStorage.getItem("otel.grafanaUrl") || "http://localhost:3001";
});

function save() {
  localStorage.setItem("otel.jaegerUrl", jaegerUrl.value.trim());
  localStorage.setItem("otel.grafanaUrl", grafanaUrl.value.trim());
  savedFlash.value = true;
  setTimeout(() => (savedFlash.value = false), 1500);
  emit("saved");
}

async function testConnection(target: "jaeger" | "grafana" | "both") {
  testing.value = target;
  testResults.value = { jaeger: null, grafana: null };

  const urls: Record<string, string> = {};
  if (target === "jaeger" || target === "both") urls.jaeger = jaegerUrl.value.trim();
  if (target === "grafana" || target === "both") urls.grafana = grafanaUrl.value.trim();

  for (const [key, url] of Object.entries(urls)) {
    try {
      // Attempt a HEAD request with a short timeout.
      // We use no-cors mode so we at least get an opaque response if the server is up.
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      await fetch(url, {
        method: "HEAD",
        mode: "no-cors",
        signal: controller.signal,
      });
      clearTimeout(timer);
      testResults.value[key] = "ok";
    } catch {
      testResults.value[key] = "fail";
    }
  }

  testing.value = "idle";
}

function resetDefaults() {
  jaegerUrl.value = "http://localhost:16686";
  grafanaUrl.value = "http://localhost:3001";
}
</script>

<template>
  <div class="flex flex-col h-full bg-gray-900 border-l border-gray-700">
    <!-- Header -->
    <div class="flex items-center justify-between px-4 py-3 border-b border-gray-700 shrink-0">
      <h2 class="text-sm font-semibold text-gray-200">OTel Backend Settings</h2>
      <button
        @click="emit('close')"
        class="p-1 rounded text-gray-400 hover:text-gray-200 hover:bg-gray-800 transition-colors"
        title="Close settings"
      >
        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>

    <!-- Form -->
    <div class="flex-1 overflow-y-auto px-4 py-4 space-y-5">
      <!-- Jaeger URL -->
      <div>
        <label class="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-1.5">
          Jaeger UI URL
        </label>
        <div class="flex gap-2">
          <input
            v-model="jaegerUrl"
            type="url"
            placeholder="http://localhost:16686"
            class="flex-1 min-w-0 px-3 py-2 text-sm bg-gray-800 border border-gray-700 rounded-md text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-colors"
          />
          <button
            @click="testConnection('jaeger')"
            :disabled="testing !== 'idle'"
            class="px-3 py-2 text-xs font-medium rounded-md bg-gray-800 text-gray-300 hover:text-white hover:bg-gray-700 border border-gray-700 disabled:opacity-50 transition-colors shrink-0"
          >
            <template v-if="testing === 'jaeger'">
              <svg class="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            </template>
            <template v-else>Test</template>
          </button>
        </div>
        <p
          v-if="testResults.jaeger"
          class="mt-1 text-xs"
          :class="testResults.jaeger === 'ok' ? 'text-emerald-400' : 'text-red-400'"
        >
          {{ testResults.jaeger === "ok" ? "Reachable" : "Could not connect" }}
        </p>
      </div>

      <!-- Grafana URL -->
      <div>
        <label class="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-1.5">
          Grafana URL
        </label>
        <div class="flex gap-2">
          <input
            v-model="grafanaUrl"
            type="url"
            placeholder="http://localhost:3001"
            class="flex-1 min-w-0 px-3 py-2 text-sm bg-gray-800 border border-gray-700 rounded-md text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-colors"
          />
          <button
            @click="testConnection('grafana')"
            :disabled="testing !== 'idle'"
            class="px-3 py-2 text-xs font-medium rounded-md bg-gray-800 text-gray-300 hover:text-white hover:bg-gray-700 border border-gray-700 disabled:opacity-50 transition-colors shrink-0"
          >
            <template v-if="testing === 'grafana'">
              <svg class="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            </template>
            <template v-else>Test</template>
          </button>
        </div>
        <p
          v-if="testResults.grafana"
          class="mt-1 text-xs"
          :class="testResults.grafana === 'ok' ? 'text-emerald-400' : 'text-red-400'"
        >
          {{ testResults.grafana === "ok" ? "Reachable" : "Could not connect" }}
        </p>
      </div>

      <!-- Test all -->
      <button
        @click="testConnection('both')"
        :disabled="testing !== 'idle'"
        class="w-full px-3 py-2 text-xs font-medium rounded-md bg-gray-800 text-gray-300 hover:text-white hover:bg-gray-700 border border-gray-700 disabled:opacity-50 transition-colors"
      >
        {{ testing === "both" ? "Testing..." : "Test All Connections" }}
      </button>

      <!-- Reset to defaults -->
      <button
        @click="resetDefaults"
        class="w-full text-xs text-gray-500 hover:text-gray-300 transition-colors py-1"
      >
        Reset to defaults
      </button>
    </div>

    <!-- Footer -->
    <div class="px-4 py-3 border-t border-gray-700 shrink-0 flex items-center gap-3">
      <button
        @click="save"
        class="flex-1 px-4 py-2 text-sm font-medium rounded-md transition-colors"
        :class="
          savedFlash
            ? 'bg-emerald-600 text-white'
            : 'bg-blue-600 text-white hover:bg-blue-500'
        "
      >
        {{ savedFlash ? "Saved" : "Save" }}
      </button>
      <button
        @click="emit('close')"
        class="px-4 py-2 text-sm font-medium rounded-md bg-gray-800 text-gray-300 hover:text-white hover:bg-gray-700 border border-gray-700 transition-colors"
      >
        Cancel
      </button>
    </div>
  </div>
</template>
