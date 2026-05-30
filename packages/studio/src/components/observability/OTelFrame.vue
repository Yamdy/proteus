<script setup lang="ts">
import { ref, computed, onMounted, watch } from "vue";

interface TabDef {
  id: "jaeger" | "grafana";
  label: string;
  defaultUrl: string;
  storageKey: string;
}

const tabs: TabDef[] = [
  {
    id: "jaeger",
    label: "Traces",
    defaultUrl: "http://localhost:16686",
    storageKey: "otel.jaegerUrl",
  },
  {
    id: "grafana",
    label: "Metrics",
    defaultUrl: "http://localhost:3001",
    storageKey: "otel.grafanaUrl",
  },
];

const STORAGE_TAB_KEY = "otel.activeTab";

const activeTab = ref<"jaeger" | "grafana">(
  (localStorage.getItem(STORAGE_TAB_KEY) as "jaeger" | "grafana") ?? "jaeger",
);
const iframeLoading = ref(true);
const iframeError = ref(false);

function getUrl(tab: TabDef): string {
  return localStorage.getItem(tab.storageKey) || tab.defaultUrl;
}

const currentUrl = computed(() => {
  const tab = tabs.find((t) => t.id === activeTab.value);
  return tab ? getUrl(tab) : "";
});

const hasUrl = computed(() => currentUrl.value.length > 0);

function switchTab(id: "jaeger" | "grafana") {
  activeTab.value = id;
  localStorage.setItem(STORAGE_TAB_KEY, id);
  iframeLoading.value = true;
  iframeError.value = false;
}

function onIframeLoad() {
  iframeLoading.value = false;
  iframeError.value = false;
}

function onIframeError() {
  iframeLoading.value = false;
  iframeError.value = true;
}

// Timeout: if iframe hasn't loaded after 8s, assume backend unavailable
let loadTimer: ReturnType<typeof setTimeout> | null = null;

watch(activeTab, () => {
  if (loadTimer) clearTimeout(loadTimer);
  iframeLoading.value = true;
  iframeError.value = false;
  loadTimer = setTimeout(() => {
    if (iframeLoading.value) {
      iframeLoading.value = false;
      iframeError.value = true;
    }
  }, 8000);
});

onMounted(() => {
  loadTimer = setTimeout(() => {
    if (iframeLoading.value) {
      iframeLoading.value = false;
      iframeError.value = true;
    }
  }, 8000);
});
</script>

<template>
  <div class="flex flex-col h-full">
    <!-- Tab bar -->
    <div class="flex items-center bg-gray-800 border-b border-gray-700 shrink-0">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        @click="switchTab(tab.id)"
        class="relative px-5 py-2.5 text-sm font-medium transition-colors"
        :class="
          activeTab === tab.id
            ? 'text-blue-400 bg-gray-800'
            : 'text-gray-400 hover:text-gray-200 hover:bg-gray-750'
        "
      >
        {{ tab.label }}
        <!-- Active indicator bar -->
        <span
          v-if="activeTab === tab.id"
          class="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-400"
        />
      </button>

      <div class="ml-auto pr-3">
        <slot name="actions" />
      </div>
    </div>

    <!-- Iframe area -->
    <div class="relative flex-1 bg-gray-900">
      <!-- Loading state -->
      <div
        v-if="iframeLoading"
        class="absolute inset-0 flex flex-col items-center justify-center z-10 bg-gray-900"
      >
        <svg
          class="w-8 h-8 text-gray-500 animate-spin mb-3"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            class="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            stroke-width="4"
          />
          <path
            class="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
        <span class="text-sm text-gray-400">
          Connecting to {{ activeTab === "jaeger" ? "Jaeger" : "Grafana" }}...
        </span>
      </div>

      <!-- Fallback: no backend configured or unreachable -->
      <div
        v-else-if="!hasUrl || iframeError"
        class="absolute inset-0 flex flex-col items-center justify-center text-center px-8"
      >
        <div
          class="w-12 h-12 rounded-xl bg-gray-800 flex items-center justify-center mb-4"
        >
          <svg
            class="w-6 h-6 text-gray-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            stroke-width="1.5"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M11.42 15.17l-5.1-5.1m0 0L11.42 4.97m-5.1 5.1H21M3 12a9 9 0 1018 0 9 9 0 00-18 0z"
            />
          </svg>
        </div>
        <p class="text-sm text-gray-400 font-medium mb-1">
          {{
            activeTab === "jaeger"
              ? "Jaeger UI not available"
              : "Grafana not available"
          }}
        </p>
        <p class="text-xs text-gray-500 max-w-xs">
          <template v-if="!hasUrl">
            No URL configured. Open settings to set the
            {{ activeTab === "jaeger" ? "Jaeger" : "Grafana" }} endpoint.
          </template>
          <template v-else>
            Could not reach
            <span class="font-mono text-gray-400 break-all">{{ currentUrl }}</span
            >. Make sure the service is running, then try again.
          </template>
        </p>
      </div>

      <!-- Actual iframe -->
      <iframe
        v-show="!iframeLoading && !iframeError && hasUrl"
        :src="currentUrl"
        class="w-full h-full border-0"
        sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
        @load="onIframeLoad"
        @error="onIframeError"
      />
    </div>
  </div>
</template>
