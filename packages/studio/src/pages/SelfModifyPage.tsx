import { useSelfModify } from "../hooks/useSelfModify";
import HistoryList from "../components/self-modify/HistoryList";
import DiffViewer from "../components/self-modify/DiffViewer";

export default function SelfModifyPage() {
  const {
    history,
    loading,
    error,
    selectedEntry,
    fetchHistory,
    fetchDetail,
    rollback,
    rollingBack,
    clearSelection,
  } = useSelfModify();

  return (
    <div data-testid="self-modify-page" className="flex h-full flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between border-b border-gray-800 px-6 py-4">
        <div>
          <h1 className="text-lg font-bold text-white">Self-Modify</h1>
          <p className="text-xs text-gray-500">
            View handler modification history and rollback to previous states
          </p>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="border-b border-red-800 bg-red-950/30 px-6 py-2 text-xs text-red-400">
          {error}
        </div>
      )}

      {/* Main content: split view */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: history list */}
        <div className="w-80 flex-shrink-0 border-r border-gray-800">
          <HistoryList
            entries={history}
            loading={loading}
            selectedId={selectedEntry?.commitId}
            onSelect={fetchDetail}
            onRefresh={fetchHistory}
          />
        </div>

        {/* Right: diff viewer */}
        <div className="flex-1">
          <DiffViewer
            detail={selectedEntry}
            onRollback={rollback}
            onClose={clearSelection}
            rollingBack={rollingBack}
          />
        </div>
      </div>
    </div>
  );
}
