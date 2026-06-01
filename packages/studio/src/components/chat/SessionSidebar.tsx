import { useEffect, useState } from "react";
import { useSession } from "../../hooks/useSession";
import type { Thread } from "../../stores/sessionStore";

export default function SessionSidebar() {
  const {
    threads,
    currentThread,
    fetchThreads,
    createThread,
    deleteThread,
    setCurrentThread,
    fetchThreadMessages,
  } = useSession();

  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetchThreads().finally(() => setLoading(false));
  }, [fetchThreads]);

  const handleCreate = async () => {
    try {
      await createThread();
    } catch (err) {
      console.error("Failed to create thread:", err);
    }
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setDeletingId(id);
    try {
      await deleteThread(id);
    } catch (err) {
      console.error("Failed to delete thread:", err);
    } finally {
      setDeletingId(null);
    }
  };

  const handleSelect = (thread: Thread) => {
    setCurrentThread(thread);
    fetchThreadMessages(thread.id);
  };

  return (
    <aside
      data-testid="session-sidebar"
      className="flex h-full w-64 flex-col glass-panel-strong"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/[0.04] px-4 py-3">
        <h2 className="text-sm font-semibold text-gray-300">Threads</h2>
        <button
          onClick={handleCreate}
          data-testid="create-session-btn"
          className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-cyan-600/80 to-teal-600/80 px-3 py-1.5 text-xs font-medium text-white shadow-glow-sm transition-all duration-200 hover:shadow-glow hover:from-cyan-500 hover:to-teal-500"
        >
          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          New
        </button>
      </div>

      {/* Thread list */}
      <div data-testid="session-list" className="flex-1 overflow-y-auto py-1">
        {loading && (
          <div className="flex items-center justify-center py-6">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-cyan-500/20 border-t-cyan-400" />
          </div>
        )}

        {!loading && threads.length === 0 && (
          <div className="px-4 py-6 text-center">
            <p className="text-xs text-gray-600">No threads yet</p>
            <p className="mt-1 text-[10px] text-gray-700">
              Create one to start
            </p>
          </div>
        )}

        {threads.map((thread) => (
          <div
            key={thread.id}
            onClick={() => handleSelect(thread)}
            data-testid={`session-item-${thread.id}`}
            className={`group relative mx-2 mb-1 flex cursor-pointer items-center justify-between rounded-lg px-3 py-2.5 transition-all duration-200 ${
              currentThread?.id === thread.id
                ? "bg-cyan-500/[0.08] glow-border text-white"
                : "text-gray-500 hover:bg-white/[0.03] hover:text-gray-300"
            }`}
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{thread.name}</p>
              <p className="text-[10px] text-gray-600 font-mono">
                {new Date(thread.createdAt).toLocaleDateString()}
              </p>
            </div>
            <button
              onClick={(e) => handleDelete(e, thread.id)}
              disabled={deletingId === thread.id}
              data-testid={`delete-session-${thread.id}`}
              className="ml-2 rounded-md p-1.5 opacity-0 transition-all hover:bg-red-500/10 group-hover:opacity-100"
              title="Delete thread"
            >
              {deletingId === thread.id ? (
                <span className="block h-3.5 w-3.5 animate-spin rounded-full border border-gray-500 border-t-transparent" />
              ) : (
                <svg
                  className="h-3.5 w-3.5 text-gray-600 transition-colors hover:text-red-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
              )}
            </button>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="border-t border-white/[0.04] px-4 py-2">
        <span className="text-[10px] font-mono text-gray-700">
          {threads.length} session{threads.length !== 1 ? "s" : ""}
        </span>
      </div>
    </aside>
  );
}
