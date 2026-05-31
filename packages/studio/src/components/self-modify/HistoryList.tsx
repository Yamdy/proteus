import type { ModifyHistoryEntry } from "../../hooks/useSelfModify";

interface HistoryListProps {
  entries: ModifyHistoryEntry[];
  loading: boolean;
  selectedId?: string;
  onSelect: (commitId: string) => void;
  onRefresh: () => void;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return d.toLocaleDateString();
}

function actionBadge(action: string): { label: string; color: string } {
  switch (action) {
    case "register":
      return { label: "ADD", color: "bg-green-900 text-green-300" };
    case "replace":
      return { label: "MOD", color: "bg-yellow-900 text-yellow-300" };
    case "unregister":
      return { label: "DEL", color: "bg-red-900 text-red-300" };
    default:
      return { label: action.toUpperCase(), color: "bg-gray-800 text-gray-400" };
  }
}

export default function HistoryList({
  entries,
  loading,
  selectedId,
  onSelect,
  onRefresh,
}: HistoryListProps) {
  return (
    <div data-testid="history-list" className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-800 px-4 py-3">
        <h2 className="text-sm font-semibold text-white">Modification History</h2>
        <button
          onClick={onRefresh}
          disabled={loading}
          className="rounded-md px-2 py-1 text-xs text-gray-400 transition-colors hover:bg-gray-800 hover:text-white disabled:opacity-50"
        >
          {loading ? "Loading..." : "Refresh"}
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {entries.length === 0 && !loading && (
          <div className="flex h-full items-center justify-center text-sm text-gray-500">
            No modifications yet
          </div>
        )}

        {entries.map((entry) => {
          const badge = actionBadge(entry.action);
          const isSelected = entry.commitId === selectedId;

          return (
            <button
              key={entry.commitId}
              onClick={() => onSelect(entry.commitId)}
              data-testid={`history-entry-${entry.commitId}`}
              className={`flex w-full flex-col gap-1 border-b border-gray-800/50 px-4 py-3 text-left transition-colors ${
                isSelected
                  ? "bg-gray-800"
                  : "hover:bg-gray-900"
              }`}
            >
              {/* Top row: badge + handler name */}
              <div className="flex items-center gap-2">
                <span
                  className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${badge.color}`}
                >
                  {badge.label}
                </span>
                <span className="truncate text-sm font-medium text-white">
                  {entry.handlerName}
                </span>
              </div>

              {/* Commit message */}
              <p className="truncate text-xs text-gray-400">
                {entry.message}
              </p>

              {/* Bottom row: time + trace ID */}
              <div className="flex items-center gap-3 text-[10px] text-gray-600">
                <span>{formatTime(entry.timestamp)}</span>
                {entry.traceId && (
                  <span className="font-mono">
                    trace:{entry.traceId.slice(0, 8)}
                  </span>
                )}
                <span className="font-mono">
                  {entry.commitId.slice(0, 7)}
                </span>
              </div>
            </button>
          );
        })}

        {loading && entries.length === 0 && (
          <div className="flex h-32 items-center justify-center">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-600 border-t-white" />
          </div>
        )}
      </div>
    </div>
  );
}
