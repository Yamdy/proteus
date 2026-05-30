<script setup lang="ts">
import { useCosts } from "../../composables/useCosts";
import TokenUsageBar from "./TokenUsageBar.vue";
import CostTable from "./CostTable.vue";

const {
  costs,
  loading,
  error,
  totalCost,
  totalInputTokens,
  totalOutputTokens,
  totalSessions,
  sessionSummaries,
  maxSessionCost,
  expandedSessionId,
  liveCostEvents,
  isConnected,
  fetchCosts,
  toggleSession,
  formatUsd,
  formatTokens,
} = useCosts();
</script>

<template>
  <div class="max-w-6xl mx-auto px-6 py-8">
    <!-- Header -->
    <div class="flex items-center justify-between mb-8">
      <div>
        <h1 class="text-2xl font-semibold text-gray-100">Cost Dashboard</h1>
        <p class="mt-1 text-sm text-gray-500">
          Token usage and cost breakdown across all sessions.
        </p>
      </div>
      <div class="flex items-center gap-3">
        <span
          class="inline-block w-2 h-2 rounded-full"
          :class="isConnected ? 'bg-emerald-400' : 'bg-gray-600'"
        />
        <span class="text-xs text-gray-500">{{ isConnected ? "Live" : "Offline" }}</span>
        <button
          @click="fetchCosts"
          :disabled="loading"
          class="px-4 py-2 text-sm font-medium rounded-lg bg-gray-800 text-gray-300 hover:text-white hover:bg-gray-700 border border-gray-700 disabled:opacity-50 transition-colors"
        >
          {{ loading ? "Loading..." : "Refresh" }}
        </button>
      </div>
    </div>

    <!-- Error -->
    <div
      v-if="error"
      class="rounded-xl bg-red-900/20 border border-red-800/40 px-4 py-3 text-sm text-red-300 mb-6"
    >
      {{ error }}
    </div>

    <!-- Summary cards -->
    <div class="grid grid-cols-3 gap-4 mb-8">
      <div class="rounded-xl border border-gray-800 bg-gray-800 px-6 py-5">
        <p class="text-xs text-gray-500 uppercase tracking-wider mb-2">Total Tokens</p>
        <p class="text-3xl font-bold text-blue-400 font-mono">
          {{ formatTokens(totalInputTokens + totalOutputTokens) }}
        </p>
        <p class="text-xs text-gray-600 mt-1 font-mono">
          {{ formatTokens(totalInputTokens) }} in / {{ formatTokens(totalOutputTokens) }} out
        </p>
      </div>
      <div class="rounded-xl border border-gray-800 bg-gray-800 px-6 py-5">
        <p class="text-xs text-gray-500 uppercase tracking-wider mb-2">Total Cost</p>
        <p class="text-3xl font-bold text-green-400 font-mono">{{ formatUsd(totalCost) }}</p>
        <p class="text-xs text-gray-600 mt-1">across {{ totalSessions }} sessions</p>
      </div>
      <div class="rounded-xl border border-gray-800 bg-gray-800 px-6 py-5">
        <p class="text-xs text-gray-500 uppercase tracking-wider mb-2">Sessions</p>
        <p class="text-3xl font-bold text-blue-400 font-mono">{{ totalSessions }}</p>
        <p class="text-xs text-gray-600 mt-1">
          {{ costs.length }} total entries
        </p>
      </div>
    </div>

    <!-- Empty state -->
    <div
      v-if="costs.length === 0 && !loading"
      class="rounded-xl border border-gray-800 bg-gray-900/50 px-6 py-16 text-center"
    >
      <div class="w-12 h-12 mx-auto mb-4 rounded-xl bg-gray-800 flex items-center justify-center">
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
            d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      </div>
      <p class="text-sm text-gray-400">No cost data yet</p>
      <p class="text-xs text-gray-600 mt-1">
        Costs are tracked as the agent makes API calls
      </p>
    </div>

    <template v-if="costs.length > 0">
      <!-- Session bar chart -->
      <div class="mb-8">
        <h2 class="text-sm font-medium text-gray-400 uppercase tracking-wider mb-4">
          Cost by Session
        </h2>
        <div class="space-y-2">
          <div
            v-for="session in sessionSummaries"
            :key="session.sessionId"
            class="group"
          >
            <div
              class="flex items-center gap-3 px-4 py-2 rounded-lg hover:bg-gray-800/40 cursor-pointer transition-colors"
              @click="toggleSession(session.sessionId)"
            >
              <svg
                class="w-3 h-3 text-gray-600 transition-transform duration-200 shrink-0"
                :class="{ 'rotate-90': expandedSessionId === session.sessionId }"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fill-rule="evenodd"
                  d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
                  clip-rule="evenodd"
                />
              </svg>
              <span class="text-xs font-mono text-gray-500 w-28 shrink-0 truncate">
                {{ session.sessionId.slice(0, 12) }}
              </span>
              <div class="flex-1 h-5 bg-gray-800 rounded overflow-hidden">
                <div
                  class="h-full bg-blue-500/60 rounded transition-all duration-500 ease-out"
                  :style="{
                    width: `${Math.max((session.totalCostUsd / maxSessionCost) * 100, 2)}%`,
                  }"
                />
              </div>
              <span class="text-xs font-mono text-gray-400 w-20 text-right shrink-0">
                {{ formatUsd(session.totalCostUsd) }}
              </span>
              <span class="text-xs text-gray-600 w-24 text-right shrink-0">
                {{ session.entries.length }} entries
              </span>
            </div>

            <!-- Expanded session detail -->
            <div
              v-if="expandedSessionId === session.sessionId"
              class="ml-8 mt-1 mb-3 p-4 rounded-lg bg-gray-900/60 border border-gray-800/50"
            >
              <div class="flex items-center gap-6 mb-3 text-xs">
                <div>
                  <span class="text-gray-500">Model:</span>
                  <span class="ml-1 text-gray-300 font-mono">{{ session.model }}</span>
                </div>
                <div>
                  <span class="text-gray-500">Tokens:</span>
                  <span class="ml-1 text-blue-400 font-mono">{{ formatTokens(session.totalInputTokens) }}</span>
                  <span class="text-gray-600 mx-1">/</span>
                  <span class="ml-1 text-emerald-400 font-mono">{{ formatTokens(session.totalOutputTokens) }}</span>
                </div>
              </div>
              <TokenUsageBar
                :input-tokens="session.totalInputTokens"
                :output-tokens="session.totalOutputTokens"
                :height="10"
              />
            </div>
          </div>
        </div>
      </div>

      <!-- Full cost table -->
      <div>
        <h2 class="text-sm font-medium text-gray-400 uppercase tracking-wider mb-4">
          All Entries
        </h2>
        <CostTable :entries="costs" />
      </div>

      <!-- Live events indicator -->
      <div
        v-if="liveCostEvents.length > 0"
        class="mt-6 p-3 rounded-lg border border-gray-800/50 bg-gray-900/30"
      >
        <p class="text-xs text-gray-500">
          <span class="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1.5 animate-pulse" />
          {{ liveCostEvents.length }} live cost event{{ liveCostEvents.length === 1 ? "" : "s" }} received this session
        </p>
      </div>
    </template>
  </div>
</template>
