import { useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import type { CostSummary, CostEntry } from "../../hooks/useObservability";

interface CostDashboardProps {
  costs: CostSummary | null;
  loading: boolean;
  onRefresh: () => void;
  onFilterSession?: (sessionId: string | null) => void;
}

const PIE_COLORS = [
  "#6366f1",
  "#8b5cf6",
  "#a78bfa",
  "#c4b5fd",
  "#e0e7ff",
  "#818cf8",
];

function formatUsd(value: number): string {
  return `$${value.toFixed(4)}`;
}

function formatTokens(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(value);
}

export default function CostDashboard({
  costs,
  loading,
  onRefresh,
  onFilterSession,
}: CostDashboardProps) {
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [view, setView] = useState<"tokens" | "cost">("cost");

  const handleSessionFilter = (sessionId: string | null) => {
    setSelectedSession(sessionId);
    onFilterSession?.(sessionId);
  };

  if (loading && !costs) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-600 border-t-white" />
      </div>
    );
  }

  if (!costs) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <p className="text-sm text-gray-500">No cost data available</p>
        <button
          onClick={onRefresh}
          className="rounded-md px-3 py-1.5 text-xs text-gray-400 transition-colors hover:bg-gray-800 hover:text-white"
        >
          Refresh
        </button>
      </div>
    );
  }

  const barData = costs.byModel.map((m) => ({
    name: m.model,
    cost: m.costUsd,
    tokens: m.tokens,
  }));

  const pieData = costs.bySession.map((s) => ({
    name: s.sessionId.slice(0, 8),
    value: view === "cost" ? s.costUsd : s.tokens,
    sessionId: s.sessionId,
  }));

  return (
    <div data-testid="cost-dashboard" className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-800 px-4 py-3">
        <h2 className="text-sm font-semibold text-white">Cost Dashboard</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={onRefresh}
            disabled={loading}
            className="rounded-md px-2 py-1 text-xs text-gray-400 transition-colors hover:bg-gray-800 hover:text-white disabled:opacity-50"
          >
            {loading ? "Loading..." : "Refresh"}
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div data-testid="cost-summary" className="grid grid-cols-2 gap-3 border-b border-gray-800 p-4">
        <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-3">
          <p className="text-[10px] uppercase tracking-wider text-gray-500">
            Total Cost
          </p>
          <p className="text-xl font-bold text-white">
            {formatUsd(costs.totalCostUsd)}
          </p>
        </div>
        <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-3">
          <p className="text-[10px] uppercase tracking-wider text-gray-500">
            Total Tokens
          </p>
          <p className="text-xl font-bold text-white">
            {formatTokens(costs.totalTokens)}
          </p>
        </div>
      </div>

      {/* Session filter */}
      {selectedSession && (
        <div className="flex items-center gap-2 border-b border-gray-800 px-4 py-2">
          <span className="text-xs text-gray-500">Filtered by session:</span>
          <span className="font-mono text-xs text-gray-300">
            {selectedSession.slice(0, 12)}
          </span>
          <button
            onClick={() => handleSessionFilter(null)}
            className="text-xs text-red-400 hover:text-red-300"
          >
            Clear
          </button>
        </div>
      )}

      {/* Charts */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* View toggle */}
        <div className="flex items-center gap-1 rounded-md bg-gray-900 p-0.5">
          <button
            onClick={() => setView("cost")}
            className={`rounded px-3 py-1 text-xs transition-colors ${
              view === "cost"
                ? "bg-gray-700 text-white"
                : "text-gray-500 hover:text-gray-300"
            }`}
          >
            By Cost
          </button>
          <button
            onClick={() => setView("tokens")}
            className={`rounded px-3 py-1 text-xs transition-colors ${
              view === "tokens"
                ? "bg-gray-700 text-white"
                : "text-gray-500 hover:text-gray-300"
            }`}
          >
            By Tokens
          </button>
        </div>

        {/* Bar chart: cost by model */}
        {barData.length > 0 && (
          <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-4">
            <h3 className="mb-3 text-xs font-medium text-gray-400">
              Cost by Model
            </h3>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={barData}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="#374151"
                  vertical={false}
                />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 10, fill: "#9ca3af" }}
                  axisLine={{ stroke: "#374151" }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "#9ca3af" }}
                  axisLine={{ stroke: "#374151" }}
                  tickLine={false}
                  tickFormatter={
                    view === "cost"
                      ? (v: number) => `$${v.toFixed(2)}`
                      : formatTokens
                  }
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#1f2937",
                    border: "1px solid #374151",
                    borderRadius: "6px",
                    fontSize: "11px",
                    color: "#e5e7eb",
                  }}
                  formatter={
                    view === "cost"
                      ? (v: number) => [formatUsd(v), "Cost"]
                      : (v: number) => [formatTokens(v), "Tokens"]
                  }
                />
                <Bar
                  dataKey={view === "cost" ? "cost" : "tokens"}
                  fill="#6366f1"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Pie chart: distribution by session */}
        {pieData.length > 0 && (
          <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-4">
            <h3 className="mb-3 text-xs font-medium text-gray-400">
              Distribution by Session
            </h3>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={40}
                  outerRadius={70}
                  paddingAngle={2}
                  dataKey="value"
                  onClick={(data) => {
                    if (data?.sessionId) {
                      handleSessionFilter(data.sessionId);
                    }
                  }}
                  style={{ cursor: "pointer" }}
                >
                  {pieData.map((_, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={PIE_COLORS[index % PIE_COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#1f2937",
                    border: "1px solid #374151",
                    borderRadius: "6px",
                    fontSize: "11px",
                    color: "#e5e7eb",
                  }}
                  formatter={(v: number) =>
                    view === "cost" ? formatUsd(v) : formatTokens(v)
                  }
                />
                <Legend
                  wrapperStyle={{ fontSize: "10px", color: "#9ca3af" }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Turn-level table */}
        {costs.byTurn.length > 0 && (
          <div className="rounded-lg border border-gray-800 bg-gray-900/50">
            <h3 className="border-b border-gray-800 px-4 py-2 text-xs font-medium text-gray-400">
              Per-Turn Breakdown
            </h3>
            <div className="max-h-64 overflow-y-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-800 text-left text-gray-500">
                    <th className="px-4 py-2 font-medium">Time</th>
                    <th className="px-4 py-2 font-medium">Model</th>
                    <th className="px-4 py-2 text-right font-medium">Prompt</th>
                    <th className="px-4 py-2 text-right font-medium">Completion</th>
                    <th className="px-4 py-2 text-right font-medium">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {costs.byTurn.map((entry: CostEntry) => (
                    <tr
                      key={entry.id}
                      className="border-b border-gray-800/50 transition-colors hover:bg-gray-800/30"
                    >
                      <td className="px-4 py-2 text-gray-400">
                        {new Date(entry.timestamp).toLocaleTimeString()}
                      </td>
                      <td className="px-4 py-2 text-gray-300">{entry.model}</td>
                      <td className="px-4 py-2 text-right text-gray-400">
                        {formatTokens(entry.promptTokens)}
                      </td>
                      <td className="px-4 py-2 text-right text-gray-400">
                        {formatTokens(entry.completionTokens)}
                      </td>
                      <td className="px-4 py-2 text-right font-medium text-white">
                        {formatUsd(entry.costUsd)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
