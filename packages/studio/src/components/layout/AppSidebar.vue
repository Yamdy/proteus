<script setup lang="ts">
import { RouterLink, useRoute } from "vue-router";
import ConnectionIndicator from "../common/ConnectionIndicator.vue";

defineProps<{
  collapsed: boolean;
}>();

const emit = defineEmits<{
  (e: "toggle"): void;
}>();

const route = useRoute();

interface NavItem {
  to: string;
  label: string;
  icon: string;
}

const mainNav: NavItem[] = [{ to: "/chat", label: "Chat", icon: "chat" }];

const configNav: NavItem[] = [
  { to: "/config/level0", label: "Level 0 — Static", icon: "cfg0" },
  { to: "/config/level1", label: "Level 1 — Runtime", icon: "cfg1" },
  { to: "/config/level2", label: "Level 2 — Strategy", icon: "cfg2" },
];

const opsNav: NavItem[] = [
  { to: "/self-modify", label: "Self-Modify", icon: "modify" },
  { to: "/observability", label: "Observability", icon: "observe" },
  { to: "/costs", label: "Costs", icon: "cost" },
];

function isActive(to: string): boolean {
  if (to === "/chat") return route.path === "/chat";
  return route.path.startsWith(to);
}

function iconPath(icon: string): string {
  const paths: Record<string, string> = {
    chat: "M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z",
    cfg0: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z",
    cfg1: "M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4",
    cfg2: "M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z",
    modify: "M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15",
    observe: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z",
    cost: "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  };
  return paths[icon] ?? paths.chat;
}
</script>

<template>
  <aside
    class="fixed top-0 left-0 z-40 h-screen bg-gray-900 border-r border-gray-800 flex flex-col transition-all duration-200 ease-in-out"
    :class="collapsed ? 'w-16' : 'w-60'"
  >
    <!-- Header -->
    <div class="h-14 flex items-center px-4 border-b border-gray-800 shrink-0">
      <div v-if="!collapsed" class="flex items-center gap-2.5 min-w-0">
        <div
          class="w-7 h-7 rounded-md bg-blue-500 flex items-center justify-center text-white font-bold text-xs shrink-0"
        >
          P
        </div>
        <span class="text-sm font-semibold text-gray-100 truncate"
          >Proteus Studio</span
        >
      </div>
      <button
        @click="emit('toggle')"
        class="ml-auto shrink-0 p-1 rounded text-gray-400 hover:text-gray-200 hover:bg-gray-800 transition-colors"
        :class="collapsed ? 'mx-auto' : ''"
        :title="collapsed ? 'Expand sidebar' : 'Collapse sidebar'"
      >
        <svg
          class="w-5 h-5 transition-transform duration-200"
          :class="collapsed ? 'rotate-180' : ''"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          stroke-width="1.5"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M11 19l-7-7 7-7m8 14l-7-7 7-7"
          />
        </svg>
      </button>
    </div>

    <!-- Navigation -->
    <nav class="flex-1 overflow-y-auto py-3 px-2 space-y-5">
      <!-- Main -->
      <div>
        <div
          v-if="!collapsed"
          class="px-2 mb-1.5 text-[10px] font-medium uppercase tracking-wider text-gray-500"
        >
          Main
        </div>
        <div class="space-y-0.5">
          <RouterLink
            v-for="item in mainNav"
            :key="item.to"
            :to="item.to"
            class="flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm transition-colors"
            :class="
              isActive(item.to)
                ? 'bg-blue-500/15 text-blue-400'
                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
            "
            :title="collapsed ? item.label : undefined"
          >
            <svg
              class="w-4.5 h-4.5 shrink-0"
              :class="collapsed ? 'mx-auto' : ''"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              stroke-width="1.5"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                :d="iconPath(item.icon)"
              />
            </svg>
            <span v-if="!collapsed" class="truncate">{{ item.label }}</span>
          </RouterLink>
        </div>
      </div>

      <!-- Config -->
      <div>
        <div
          v-if="!collapsed"
          class="px-2 mb-1.5 text-[10px] font-medium uppercase tracking-wider text-gray-500"
        >
          Configuration
        </div>
        <div class="space-y-0.5">
          <RouterLink
            v-for="item in configNav"
            :key="item.to"
            :to="item.to"
            class="flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm transition-colors"
            :class="
              isActive(item.to)
                ? 'bg-blue-500/15 text-blue-400'
                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
            "
            :title="collapsed ? item.label : undefined"
          >
            <svg
              class="w-4.5 h-4.5 shrink-0"
              :class="collapsed ? 'mx-auto' : ''"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              stroke-width="1.5"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                :d="iconPath(item.icon)"
              />
            </svg>
            <span v-if="!collapsed" class="truncate">{{ item.label }}</span>
          </RouterLink>
        </div>
      </div>

      <!-- Ops -->
      <div>
        <div
          v-if="!collapsed"
          class="px-2 mb-1.5 text-[10px] font-medium uppercase tracking-wider text-gray-500"
        >
          Operations
        </div>
        <div class="space-y-0.5">
          <RouterLink
            v-for="item in opsNav"
            :key="item.to"
            :to="item.to"
            class="flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm transition-colors"
            :class="
              isActive(item.to)
                ? 'bg-blue-500/15 text-blue-400'
                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
            "
            :title="collapsed ? item.label : undefined"
          >
            <svg
              class="w-4.5 h-4.5 shrink-0"
              :class="collapsed ? 'mx-auto' : ''"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              stroke-width="1.5"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                :d="iconPath(item.icon)"
              />
            </svg>
            <span v-if="!collapsed" class="truncate">{{ item.label }}</span>
          </RouterLink>
        </div>
      </div>
    </nav>

    <!-- Footer: connection status -->
    <div class="px-3 py-3 border-t border-gray-800 shrink-0">
      <div class="flex items-center gap-2" :class="collapsed ? 'justify-center' : ''">
        <ConnectionIndicator />
        <span v-if="!collapsed" class="text-xs text-gray-500 capitalize">
          {{ $connectionStatus }}
        </span>
      </div>
    </div>
  </aside>
</template>

<script lang="ts">
import { useConnectionStore } from "../../stores/connectionStore";

export default {
  computed: {
    $connectionStatus() {
      return useConnectionStore().status;
    },
  },
};
</script>
