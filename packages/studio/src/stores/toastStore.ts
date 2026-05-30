import { defineStore } from "pinia";
import { ref } from "vue";

export type ToastType = "phase" | "tool_call" | "cost" | "info" | "error";

export interface Toast {
  id: string;
  type: ToastType;
  title: string;
  message: string;
  createdAt: number;
}

const AUTO_DISMISS_MS = 5000;

let nextId = 0;
function genId(): string {
  return `toast-${Date.now()}-${nextId++}`;
}

export const useToastStore = defineStore("toast", () => {
  const toasts = ref<Toast[]>([]);
  const timers = new Map<string, ReturnType<typeof setTimeout>>();

  function addToast(type: ToastType, title: string, message: string): string {
    const id = genId();
    const toast: Toast = { id, type, title, message, createdAt: Date.now() };
    toasts.value.push(toast);

    // Auto-dismiss after 5s
    const timer = setTimeout(() => {
      dismiss(id);
    }, AUTO_DISMISS_MS);
    timers.set(id, timer);

    // Keep max 5 visible — remove oldest
    if (toasts.value.length > 5) {
      const oldest = toasts.value[0];
      dismiss(oldest.id);
    }

    return id;
  }

  function dismiss(id: string) {
    toasts.value = toasts.value.filter((t) => t.id !== id);
    const timer = timers.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.delete(id);
    }
  }

  function clearAll() {
    for (const timer of timers.values()) clearTimeout(timer);
    timers.clear();
    toasts.value = [];
  }

  return { toasts, addToast, dismiss, clearAll };
});
