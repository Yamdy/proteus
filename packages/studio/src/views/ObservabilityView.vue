<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useObservabilityStore } from "../stores/observabilityStore";
import OTelFrame from "../components/observability/OTelFrame.vue";
import OTelConfigPanel from "../components/observability/OTelConfigPanel.vue";

const obsStore = useObservabilityStore();
const showSettings = ref(false);
const viewMode = ref<"otel" | "traces">("otel");

onMounted(() => {
  obsStore.fetchTraces();
});

function onSettingsSaved() {
  // Force OTelFrame to re-evaluate by toggling view if needed
  // The child reads localStorage reactively via computed, so no extra work needed
}
</script>

<template>
  <div class="flex flex-col h-[calc(100vh-3.5rem)] sm:h-screen">
    <!-- View mode toggle bar -->
    <div class="flex items-center gap-1 px-3 py-2 bg-gray-900 border-b border-gray-800 shrink-0">
      <button
        @click="viewMode = 'otel'"
        class="px-3 py-1.5 text-xs font-medium rounded-md transition-colors"
        :class="
          viewMode === 'otel'
            ? 'bg-gray-800 text-gray-200'
            : 'text-gray-500 hover:text-gray-300'
        "
      >
        OTel Dashboards
      </button>
      <button
        @click="viewMode = 'traces'"
        class="px-3 py-1.5 text-xs font-medium rounded-md transition-colors"
        :class="
          viewMode === 'traces'
            ? 'bg-gray-800 text-gray-200'
            : 'text-gray-500 hover:text-gray-300'
        "
      >
        Traces
      </button>

      <div class="ml-auto flex items-center gap-2">
        <!-- Settings gear (visible in OTel mode) -->
        <button
          v-if="viewMode === 'otel'"
          @click="showSettings = !showSettings"
          class="p-1.5 rounded-md transition-colors"
          :class="
            showSettings
              ? 'bg-gray-700 text-blue-400'
              : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
          "
          title="OTel backend settings"
        >
          <svg
            class="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            stroke-width="1.5"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z"
            />
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
            />
          </svg>
        </button>

        <!-- Refresh (visible in traces mode) -->
        <button
          v-if="viewMode === 'traces'"
          @click="obsStore.fetchTraces()"
          :disabled="obsStore.loading"
          class="px-3 py-1.5 text-xs font-medium rounded-md bg-gray-800 text-gray-300 hover:text-white hover:bg-gray-700 border border-gray-700 disabled:opacity-50 transition-colors"
        >
          Refresh
        </button>
      </div>
    </div>

    <!-- Content area -->
    <div class="flex-1 flex overflow-hidden">
      <!-- Main panel: OTel iframe or traces list -->
      <div class="flex-1 flex flex-col overflow-hidden">
        <!-- OTel iframe mode -->
        <template v-if="viewMode === 'otel'">
          <OTelFrame class="flex-1">
            <template #actions>
              <button
                @click="showSettings = !showSettings"
                class="p-1 rounded text-gray-400 hover:text-gray-200 hover:bg-gray-700 transition-colors"
                title="Settings"
              >
                <svg
                  class="w-3.5 h-3.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                  />
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                </svg>
              </button>
            </template>
          </OTelFrame>
        </template>

        <!-- Native traces mode -->
        <template v-else>
          <div class="flex-1 overflow-y-auto px-6 py-6">
            <div class="mb-4 flex items-center gap-3">
              <span v-if="obsStore.loading" class="text-xs text-gray-500 flex items-center gap-1.5">
                <svg class="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Loading traces...
              </span>
            </div>

            <div v-if="obsStore.error" class="rounded-lg bg-red-900/20 border border-red-800/40 px-4 py-3 text-sm text-red-300 mb-6">
              {{ obsStore.error }}
            </div>

            <!-- Empty state -->
            <div v-if="obsStore.recentTraces.length === 0 && !obsStore.loading" class="rounded-lg border border-gray-800 bg-gray-900/50 px-6 py-12 text-center">
              <div class="w-10 h-10 mx-auto mb-3 rounded-lg bg-gray-800 flex items-center justify-center">
                <svg class="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <p class="text-sm text-gray-400">No traces recorded</p>
              <p class="text-xs text-gray-600 mt-1">Traces appear as the agent processes requests</p>
            </div>

            <!-- Trace list -->
            <div v-else class="space-y-2">
              <div
                v-for="trace in obsStore.recentTraces"
                :key="trace.id"
                class="rounded-lg border border-gray-800 bg-gray-900/50 overflow-hidden cursor-pointer hover:border-gray-700 transition-colors"
                :class="obsStore.selectedTraceId === trace.id ? 'border-blue-500/40 ring-1 ring-blue-500/20' : ''"
                @click="obsStore.selectTrace(trace.id)"
              >
                <!-- Trace header -->
                <div class="px-5 py-3 flex items-center gap-4">
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2">
                      <span class="text-sm font-mono text-gray-300 truncate">{{ trace.id.slice(0, 8) }}</span>
                      <span class="text-xs text-gray-600">session {{ trace.sessionId.slice(0, 8) }}</span>
                    </div>
                  </div>
                  <div class="flex items-center gap-4 text-xs text-gray-500">
                    <span v-if="trace.model" class="font-mono">{{ trace.model }}</span>
                    <span>{{ trace.startedAt ? new Date(trace.startedAt).toLocaleTimeString() : "--" }}</span>
                    <span class="font-mono text-gray-400">
                      {{ trace.totalDurationMs !== undefined ? (trace.totalDurationMs < 1000 ? trace.totalDurationMs + "ms" : (trace.totalDurationMs / 1000).toFixed(1) + "s") : "--" }}
                    </span>
                  </div>
                </div>

                <!-- Expanded detail -->
                <div v-if="obsStore.selectedTraceId === trace.id" class="border-t border-gray-800 px-5 py-4 space-y-3">
                  <!-- Phases -->
                  <div>
                    <h3 class="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">Phases</h3>
                    <div class="space-y-1">
                      <div
                        v-for="phase in trace.phases"
                        :key="phase.name"
                        class="flex items-center gap-3 text-sm"
                      >
                        <span
                          class="w-2 h-2 rounded-full shrink-0"
                          :class="{
                            'bg-gray-600': phase.status === 'pending',
                            'bg-blue-400 animate-pulse': phase.status === 'running',
                            'bg-emerald-400': phase.status === 'completed',
                            'bg-red-400': phase.status === 'error',
                          }"
                        />
                        <span class="flex-1 text-gray-300">{{ phase.name }}</span>
                        <span class="text-xs font-mono text-gray-500">
                          {{ phase.durationMs !== undefined ? (phase.durationMs < 1000 ? phase.durationMs + "ms" : (phase.durationMs / 1000).toFixed(1) + "s") : "--" }}
                        </span>
                      </div>
                    </div>
                  </div>

                  <!-- Token usage -->
                  <div v-if="trace.tokenUsage" class="flex items-center gap-4 text-xs">
                    <span class="text-gray-500">Tokens:</span>
                    <span class="text-gray-400">{{ trace.tokenUsage.input }} in</span>
                    <span class="text-gray-400">{{ trace.tokenUsage.output }} out</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </template>
      </div>

      <!-- Settings side panel -->
      <Transition name="slide-panel">
        <div v-if="showSettings" class="w-80 shrink-0 overflow-hidden">
          <OTelConfigPanel
            @close="showSettings = false"
            @saved="onSettingsSaved"
          />
        </div>
      </Transition>
    </div>
  </div>
</template>

<style scoped>
.slide-panel-enter-active,
.slide-panel-leave-active {
  transition: width 0.2s ease, opacity 0.2s ease;
  overflow: hidden;
}
.slide-panel-enter-from,
.slide-panel-leave-to {
  width: 0;
  opacity: 0;
}
</style>
