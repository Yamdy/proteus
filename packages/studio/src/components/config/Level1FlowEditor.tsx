import { useEffect, useState } from "react";
import type { Level1Config, HandlerConfig } from "../../hooks/useConfig";

interface Level1FlowEditorProps {
  config: Level1Config;
  saving: boolean;
  onSave: (config: Level1Config) => Promise<void>;
}

export default function Level1FlowEditor({
  config,
  saving,
  onSave,
}: Level1FlowEditorProps) {
  const [handlers, setHandlers] = useState<HandlerConfig[]>(config.handlers);
  const [dirty, setDirty] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<HandlerConfig | null>(null);

  useEffect(() => {
    setHandlers(config.handlers);
    setDirty(false);
    setEditingId(null);
    setEditDraft(null);
  }, [config]);

  const markDirty = () => setDirty(true);

  // --- Reorder ---
  const moveHandler = (index: number, direction: -1 | 1) => {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= handlers.length) return;
    const updated = [...handlers];
    const [moved] = updated.splice(index, 1);
    updated.splice(newIndex, 0, moved);
    // Update priorities to match new order
    const reindexed = updated.map((h, i) => ({ ...h, priority: i + 1 }));
    setHandlers(reindexed);
    markDirty();
  };

  // --- Toggle enabled ---
  const toggleHandler = (id: string) => {
    setHandlers((prev) =>
      prev.map((h) => (h.id === id ? { ...h, enabled: !h.enabled } : h)),
    );
    markDirty();
  };

  // --- Edit handler ---
  const startEdit = (handler: HandlerConfig) => {
    setEditingId(handler.id);
    setEditDraft({ ...handler });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditDraft(null);
  };

  const saveEdit = () => {
    if (!editDraft) return;
    setHandlers((prev) =>
      prev.map((h) => (h.id === editDraft.id ? editDraft : h)),
    );
    setEditingId(null);
    setEditDraft(null);
    markDirty();
  };

  // --- Save / Reset ---
  const handleSave = async () => {
    await onSave({ handlers });
    setDirty(false);
  };

  const handleReset = () => {
    setHandlers(config.handlers);
    setDirty(false);
    setEditingId(null);
    setEditDraft(null);
  };

  return (
    <div data-testid="level1-editor" className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-400">
            Handler Pipeline
          </h3>
          <p className="text-xs text-gray-600">
            Handlers execute in priority order (top = highest priority)
          </p>
        </div>
      </div>

      {/* Handler list */}
      {handlers.length === 0 ? (
        <p className="text-sm text-gray-600">No handlers configured.</p>
      ) : (
        <div data-testid="handler-list" className="space-y-2">
          {handlers.map((handler, index) => (
            <div key={handler.id} data-testid={`handler-${handler.id}`}>
              {/* Handler row */}
              <div
                className={`flex items-center gap-3 rounded-lg border px-4 py-3 transition-colors ${
                  editingId === handler.id
                    ? "border-blue-600 bg-gray-900"
                    : "border-gray-800 bg-gray-900"
                } ${!handler.enabled ? "opacity-50" : ""}`}
              >
                {/* Priority badge */}
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-800 text-xs font-bold text-gray-400">
                  {handler.priority}
                </div>

                {/* Arrow connector (except last) */}
                {index < handlers.length - 1 && (
                  <div className="absolute -bottom-2 left-1/2 h-2 w-px bg-gray-700" />
                )}

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-200 truncate">
                      {handler.name}
                    </span>
                    {handler.description && (
                      <span className="text-xs text-gray-600 truncate">
                        {handler.description}
                      </span>
                    )}
                  </div>
                </div>

                {/* Reorder buttons */}
                <div className="flex flex-col gap-0.5">
                  <button
                    onClick={() => moveHandler(index, -1)}
                    disabled={index === 0}
                    data-testid={`move-up-${handler.id}`}
                    className="rounded p-0.5 text-gray-600 transition-colors hover:text-gray-300 disabled:opacity-30"
                    title="Move up"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
                    </svg>
                  </button>
                  <button
                    onClick={() => moveHandler(index, 1)}
                    disabled={index === handlers.length - 1}
                    data-testid={`move-down-${handler.id}`}
                    className="rounded p-0.5 text-gray-600 transition-colors hover:text-gray-300 disabled:opacity-30"
                    title="Move down"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                </div>

                {/* Toggle */}
                <button
                  onClick={() => toggleHandler(handler.id)}
                  className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                    handler.enabled ? "bg-blue-600" : "bg-gray-700"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                      handler.enabled ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>

                {/* Edit button */}
                <button
                  onClick={() => startEdit(handler)}
                  className="rounded p-1.5 text-gray-600 transition-colors hover:bg-gray-800 hover:text-gray-300"
                  title="Edit handler"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
              </div>

              {/* Inline edit panel */}
              {editingId === handler.id && editDraft && (
                <div className="mt-2 rounded-lg border border-blue-800 bg-gray-950 p-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-400">
                        Name
                      </label>
                      <input
                        type="text"
                        value={editDraft.name}
                        onChange={(e) =>
                          setEditDraft({ ...editDraft, name: e.target.value })
                        }
                        className="w-full rounded border border-gray-700 bg-gray-900 px-3 py-1.5 text-sm text-gray-100 outline-none focus:border-blue-600"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-400">
                        Description
                      </label>
                      <input
                        type="text"
                        value={editDraft.description ?? ""}
                        onChange={(e) =>
                          setEditDraft({
                            ...editDraft,
                            description: e.target.value || undefined,
                          })
                        }
                        className="w-full rounded border border-gray-700 bg-gray-900 px-3 py-1.5 text-sm text-gray-100 outline-none focus:border-blue-600"
                      />
                    </div>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={saveEdit}
                      className="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-500"
                    >
                      Apply
                    </button>
                    <button
                      onClick={cancelEdit}
                      className="rounded border border-gray-700 px-3 py-1 text-xs text-gray-400 hover:text-gray-200"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Flow arrow between handlers */}
              {index < handlers.length - 1 && (
                <div className="flex justify-center py-1">
                  <svg className="h-5 w-5 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                  </svg>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3 border-t border-gray-800 pt-6">
        <button
          onClick={handleSave}
          disabled={!dirty || saving}
          className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {saving ? "Saving..." : "Save Changes"}
        </button>
        <button
          onClick={handleReset}
          disabled={!dirty || saving}
          className="rounded-lg border border-gray-700 px-5 py-2 text-sm font-medium text-gray-400 transition-colors hover:border-gray-600 hover:text-gray-200 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Reset
        </button>
      </div>
    </div>
  );
}
