<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useSessionStore } from "../../stores/sessionStore";
import { useSession } from "../../composables/useSession";

const store = useSessionStore();
const { fetchSessions, createSession, deleteSession } = useSession();

const newLabel = ref("");
const isCreating = ref(false);
const showInput = ref(false);
const deletingId = ref<string | null>(null);

onMounted(() => {
  fetchSessions();
});

function openNewInput() {
  showInput.value = true;
  newLabel.value = "";
}

function cancelNew() {
  showInput.value = false;
  newLabel.value = "";
}

async function handleCreate() {
  const label = newLabel.value.trim() || "New Session";
  isCreating.value = true;
  await createSession(label);
  isCreating.value = false;
  showInput.value = false;
  newLabel.value = "";
}

function handleInputKeydown(e: KeyboardEvent) {
  if (e.key === "Enter") {
    e.preventDefault();
    handleCreate();
  } else if (e.key === "Escape") {
    cancelNew();
  }
}

function switchTo(id: string) {
  store.setActiveSession(id);
}

async function handleDelete(e: MouseEvent, id: string) {
  e.stopPropagation();
  deletingId.value = id;
  await deleteSession(id);
  deletingId.value = null;
}

function formatTime(ts: number): string {
  const now = Date.now();
  const diff = now - ts;
  if (diff < 60_000) return "now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
</script>

<template>
  <div class="flex flex-col h-full bg-gray-900 border-r border-gray-800 w-64 shrink-0">
    <!-- Header -->
    <div class="h-11 flex items-center justify-between px-3 border-b border-gray-800 shrink-0">
      <span class="text-xs font-medium uppercase tracking-wider text-gray-500">Sessions</span>
      <button
        @click="openNewInput"
        class="p-1 rounded text-gray-500 hover:text-gray-300 hover:bg-gray-800 transition-colors"
        title="New session"
      >
        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
      </button>
    </div>

    <!-- New session input -->
    <div v-if="showInput" class="px-2 pt-2 pb-1 shrink-0">
      <input
        ref="newInputEl"
        v-model="newLabel"
        @keydown="handleInputKeydown"
        @blur="cancelNew"
        placeholder="Session name..."
        :disabled="isCreating"
        class="w-full bg-gray-800 border border-gray-700 rounded-md px-2.5 py-1.5 text-xs text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-colors"
        autofocus
      />
    </div>

    <!-- Session list -->
    <div class="flex-1 overflow-y-auto py-1">
      <div v-if="store.sortedSessions.length === 0" class="px-3 py-6 text-center">
        <p class="text-xs text-gray-600">No sessions yet</p>
      </div>

      <button
        v-for="session in store.sortedSessions"
        :key="session.id"
        @click="switchTo(session.id)"
        class="group w-full flex items-start gap-2.5 px-3 py-2 text-left transition-colors"
        :class="
          session.id === store.activeSessionId
            ? 'bg-gray-800 text-gray-100'
            : 'text-gray-400 hover:bg-gray-800/50 hover:text-gray-200'
        "
      >
        <!-- Session icon -->
        <svg class="w-3.5 h-3.5 mt-0.5 shrink-0 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>

        <!-- Label + meta -->
        <div class="flex-1 min-w-0">
          <div class="text-xs font-medium truncate leading-tight">{{ session.label }}</div>
          <div class="flex items-center gap-1.5 mt-0.5">
            <span class="text-[10px] text-gray-600">{{ formatTime(session.lastActivityAt) }}</span>
            <span v-if="session.messageCount > 0" class="text-[10px] text-gray-600">
              {{ session.messageCount }} msg{{ session.messageCount === 1 ? '' : 's' }}
            </span>
          </div>
        </div>

        <!-- Delete button (visible on hover or active) -->
        <button
          @click="(e: MouseEvent) => handleDelete(e, session.id)"
          :disabled="deletingId === session.id"
          class="shrink-0 p-0.5 rounded opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400 hover:bg-gray-700 transition-all"
          :class="session.id === store.activeSessionId ? 'opacity-60' : ''"
          title="Delete session"
        >
          <svg v-if="deletingId !== session.id" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
          </svg>
          <span v-else class="block w-3.5 h-3.5 animate-spin border border-gray-500 border-t-transparent rounded-full"></span>
        </button>
      </button>
    </div>
  </div>
</template>
