import { useEffect, useState } from "react";
import { useSession } from "../../hooks/useSession";
import type { Session } from "../../stores/sessionStore";

export default function SessionSidebar() {
  const {
    sessions,
    currentSession,
    fetchSessions,
    createSession,
    deleteSession,
    setCurrentSession,
  } = useSession();

  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetchSessions().finally(() => setLoading(false));
  }, [fetchSessions]);

  const handleCreate = async () => {
    try {
      await createSession();
    } catch (err) {
      console.error("Failed to create session:", err);
    }
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setDeletingId(id);
    try {
      await deleteSession(id);
    } catch (err) {
      console.error("Failed to delete session:", err);
    } finally {
      setDeletingId(null);
    }
  };

  const handleSelect = (session: Session) => {
    setCurrentSession(session);
  };

  return (
    <aside data-testid="session-sidebar" className="flex h-full w-64 flex-col border-r border-gray-800 bg-gray-950">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-800 px-4 py-3">
        <h2 className="text-sm font-semibold text-gray-300">Sessions</h2>
        <button
          onClick={handleCreate}
          data-testid="create-session-btn"
          className="rounded-md bg-blue-600 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-blue-500"
        >
          + New
        </button>
      </div>

      {/* Session list */}
      <div data-testid="session-list" className="flex-1 overflow-y-auto py-1">
        {loading && (
          <div className="px-4 py-3 text-xs text-gray-500">Loading...</div>
        )}

        {!loading && sessions.length === 0 && (
          <div className="px-4 py-3 text-xs text-gray-500">
            No sessions yet. Create one to start.
          </div>
        )}

        {sessions.map((session) => (
          <div
            key={session.id}
            onClick={() => handleSelect(session)}
            data-testid={`session-item-${session.id}`}
            className={`group flex cursor-pointer items-center justify-between px-4 py-2.5 transition-colors ${
              currentSession?.id === session.id
                ? "bg-gray-800 text-white"
                : "text-gray-400 hover:bg-gray-900 hover:text-gray-200"
            }`}
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{session.name}</p>
              <p className="text-[10px] opacity-50">
                {new Date(session.createdAt).toLocaleDateString()}
              </p>
            </div>
            <button
              onClick={(e) => handleDelete(e, session.id)}
              disabled={deletingId === session.id}
              data-testid={`delete-session-${session.id}`}
              className="ml-2 rounded p-1 opacity-0 transition-opacity hover:bg-gray-700 group-hover:opacity-100"
              title="Delete session"
            >
              {deletingId === session.id ? (
                <span className="block h-3.5 w-3.5 animate-spin rounded-full border border-gray-500 border-t-transparent" />
              ) : (
                <svg
                  className="h-3.5 w-3.5 text-gray-500 hover:text-red-400"
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
      <div className="border-t border-gray-800 px-4 py-2 text-[10px] text-gray-600">
        {sessions.length} session{sessions.length !== 1 ? "s" : ""}
      </div>
    </aside>
  );
}
