<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import { useSelfModifyStore } from "../stores/selfModifyStore";
import { useSessionStore } from "../stores/sessionStore";
import SelfModifyHistory from "../components/self-modify/SelfModifyHistory.vue";
import DiffViewer from "../components/self-modify/DiffViewer.vue";
import RollbackButton from "../components/self-modify/RollbackButton.vue";

const store = useSelfModifyStore();
const sessionStore = useSessionStore();

const showMobileDetail = ref(false);

function handleSelect(_id: string) {
  showMobileDetail.value = true;
}

function closeMobileDetail() {
  showMobileDetail.value = false;
}

function handleRollback(entryId: string) {
  store.rollback(entryId);
}

onMounted(() => {
  const sessionId = sessionStore.activeSessionId ?? "default";
  store.fetchEntries(sessionId);
});

// When active session changes, refetch
watch(
  () => sessionStore.activeSessionId,
  (sid) => {
    if (sid) store.fetchEntries(sid);
  },
);
</script>

<template>
  <div class="flex flex-col h-[calc(100vh-3.5rem)]">
    <!-- Page header -->
    <div class="px-6 py-5 border-b border-gray-800 shrink-0">
      <div class="flex items-center justify-between gap-4">
        <div>
          <h1 class="text-xl font-semibold text-gray-100">Self-Modify</h1>
          <p class="mt-0.5 text-xs text-gray-500">
            History of runtime handler modifications. Review diffs and rollback changes.
          </p>
        </div>
        <button
          @click="store.fetchEntries(sessionStore.activeSessionId ?? 'default')"
          :disabled="store.loading"
          class="px-3 py-1.5 text-xs font-medium rounded-md bg-gray-800 text-gray-300 hover:text-white hover:bg-gray-700 border border-gray-700 disabled:opacity-50 transition-colors flex items-center gap-1.5"
        >
          <svg
            class="w-3.5 h-3.5"
            :class="{ 'animate-spin': store.loading }"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            stroke-width="1.5"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182"
            />
          </svg>
          Refresh
        </button>
      </div>
    </div>

    <!-- Error banner -->
    <div
      v-if="store.error"
      class="mx-6 mt-4 rounded-lg bg-red-900/20 border border-red-800/40 px-4 py-2.5 text-xs text-red-300 flex items-center gap-2 shrink-0"
    >
      <svg class="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
        <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
      </svg>
      {{ store.error }}
    </div>

    <!-- Main content: history left, detail right -->
    <div class="flex-1 flex min-h-0">
      <!-- Left panel: history list -->
      <div
        class="w-full md:w-80 lg:w-96 border-r border-gray-800 shrink-0 flex flex-col"
        :class="{ 'hidden md:flex': showMobileDetail }"
      >
        <SelfModifyHistory @select="handleSelect" />
      </div>

      <!-- Right panel: diff + actions -->
      <div
        class="flex-1 flex flex-col min-w-0"
        :class="{ 'hidden md:flex': !showMobileDetail }"
      >
        <!-- No selection state -->
        <div
          v-if="!store.selectedEntry"
          class="flex-1 flex items-center justify-center"
        >
          <div class="text-center px-6">
            <div class="w-12 h-12 mx-auto mb-3 rounded-lg bg-gray-900 border border-gray-800 flex items-center justify-center">
              <svg class="w-6 h-6 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1">
                <path stroke-linecap="round" stroke-linejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
              </svg>
            </div>
            <p class="text-sm text-gray-500">Select an entry to view diff</p>
            <p class="text-xs text-gray-700 mt-1">Click any modification in the timeline</p>
          </div>
        </div>

        <!-- Selected entry detail -->
        <template v-else>
          <!-- Mobile back button -->
          <div class="md:hidden px-4 py-2 border-b border-gray-800">
            <button
              @click="closeMobileDetail"
              class="text-xs text-gray-400 hover:text-gray-200 flex items-center gap-1 transition-colors"
            >
              <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
              </svg>
              Back to history
            </button>
          </div>

          <!-- Entry header bar -->
          <div class="px-4 py-3 border-b border-gray-800 flex items-center gap-3 shrink-0">
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2">
                <span
                  class="text-[10px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded"
                  :class="{
                    'bg-emerald-500/10 text-emerald-400': store.selectedEntry.action === 'register',
                    'bg-amber-500/10 text-amber-400': store.selectedEntry.action === 'replace',
                    'bg-red-500/10 text-red-400': store.selectedEntry.action === 'unregister',
                  }"
                >
                  {{ store.selectedEntry.action }}
                </span>
                <span class="text-sm font-mono text-gray-200 truncate">
                  {{ store.selectedEntry.handlerName }}
                </span>
              </div>
              <p
                v-if="store.selectedEntry.description"
                class="text-xs text-gray-500 mt-1 truncate"
              >
                {{ store.selectedEntry.description }}
              </p>
            </div>

            <RollbackButton
              :entry-id="store.selectedEntry.id"
              :handler-name="store.selectedEntry.handlerName"
              :disabled="store.selectedEntry.status === 'rolled_back'"
              :loading="store.rollingBack === store.selectedEntry.id"
              @rollback="handleRollback"
            />
          </div>

          <!-- Diff viewer -->
          <div class="flex-1 min-h-0">
            <DiffViewer
              :blocks="store.selectedEntry.diff ?? []"
              :title="`${store.selectedEntry.handlerName} changes`"
            />
          </div>

          <!-- Meta footer -->
          <div class="px-4 py-2.5 border-t border-gray-800 flex items-center gap-4 text-[10px] text-gray-600 shrink-0">
            <span>ID: {{ store.selectedEntry.id.slice(0, 12) }}</span>
            <span v-if="store.selectedEntry.snapshotId">
              Snapshot: {{ store.selectedEntry.snapshotId }}
            </span>
            <span v-if="store.selectedEntry.trust !== undefined">
              Trust: {{ store.selectedEntry.trust }}
            </span>
            <span
              class="ml-auto"
              :class="{
                'text-emerald-500': store.selectedEntry.status === 'success',
                'text-gray-500': store.selectedEntry.status === 'rolled_back',
                'text-red-500': store.selectedEntry.status === 'error',
              }"
            >
              {{ store.selectedEntry.status }}
            </span>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>
