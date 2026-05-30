<script setup lang="ts">
import { ref } from "vue";

const props = defineProps<{
  entryId: string;
  handlerName: string;
  disabled?: boolean;
  loading?: boolean;
}>();

const emit = defineEmits<{
  (e: "rollback", entryId: string): void;
}>();

const showDialog = ref(false);
const confirming = ref(false);

function openDialog() {
  if (props.disabled || props.loading) return;
  showDialog.value = true;
  confirming.value = false;
}

function cancelDialog() {
  showDialog.value = false;
  confirming.value = false;
}

function confirmRollback() {
  confirming.value = true;
  emit("rollback", props.entryId);
  showDialog.value = false;
  confirming.value = false;
}
</script>

<template>
  <div class="relative inline-block">
    <!-- Trigger button -->
    <button
      @click="openDialog"
      :disabled="disabled || loading"
      class="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border transition-colors"
      :class="
        disabled
          ? 'border-gray-800 text-gray-600 cursor-not-allowed'
          : 'border-gray-700 text-gray-300 hover:text-amber-300 hover:border-amber-600/40 hover:bg-amber-500/5'
      "
    >
      <svg
        v-if="loading"
        class="w-3.5 h-3.5 animate-spin"
        fill="none"
        viewBox="0 0 24 24"
      >
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
      <svg
        v-else
        class="w-3.5 h-3.5"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        stroke-width="1.5"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3"
        />
      </svg>
      Rollback
    </button>

    <!-- Confirmation dialog (teleported to body for proper z-index) -->
    <Teleport to="body">
      <Transition name="dialog-fade">
        <div
          v-if="showDialog"
          class="fixed inset-0 z-50 flex items-center justify-center"
        >
          <!-- Backdrop -->
          <div
            class="absolute inset-0 bg-black/60 backdrop-blur-sm"
            @click="cancelDialog"
          />

          <!-- Dialog -->
          <div class="relative z-10 w-full max-w-sm mx-4 bg-gray-900 border border-gray-700 rounded-lg shadow-xl">
            <div class="px-5 py-4">
              <div class="flex items-center gap-3 mb-3">
                <div class="w-8 h-8 rounded-full bg-amber-500/10 flex items-center justify-center shrink-0">
                  <svg
                    class="w-4 h-4 text-amber-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    stroke-width="1.5"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
                    />
                  </svg>
                </div>
                <div>
                  <h3 class="text-sm font-medium text-gray-100">Confirm Rollback</h3>
                  <p class="text-xs text-gray-400 mt-0.5">This action cannot be undone</p>
                </div>
              </div>
              <p class="text-sm text-gray-300">
                Rollback
                <span class="font-mono text-amber-300">{{ handlerName }}</span>
                to its previous state?
              </p>
            </div>
            <div class="px-5 py-3 border-t border-gray-800 flex items-center justify-end gap-2">
              <button
                @click="cancelDialog"
                class="px-3 py-1.5 text-xs font-medium text-gray-400 hover:text-gray-200 rounded-md hover:bg-gray-800 transition-colors"
              >
                Cancel
              </button>
              <button
                @click="confirmRollback"
                :disabled="confirming"
                class="px-3 py-1.5 text-xs font-medium rounded-md bg-amber-600 text-white hover:bg-amber-500 disabled:opacity-50 transition-colors"
              >
                {{ confirming ? "Rolling back..." : "Confirm Rollback" }}
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.dialog-fade-enter-active,
.dialog-fade-leave-active {
  transition: opacity 0.15s ease;
}
.dialog-fade-enter-from,
.dialog-fade-leave-to {
  opacity: 0;
}
</style>
