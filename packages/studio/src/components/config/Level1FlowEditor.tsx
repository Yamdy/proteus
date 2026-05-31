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

  const moveHandler = (index: number, direction: -1 | 1) => {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= handlers.length) return;
    const updated = [...handlers];
    const [moved] = updated.splice(index, 1);
    updated.splice(newIndex, 0, moved);
    const reindexed = updated.map((h, i) => ({ ...h, priority: i + 1 }));
    setHandlers(reindexed);
    markDirty();
  };

  const toggleHandler = (id: string) => {
    setHandlers((prev) =>
      prev.map((h) => (h.id === id ? { ...h, enabled: !h.enabled } : h)),
    );
    markDirty();
  };

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
    <div
      data-testid="level1-editor"
      className="flex flex-col gap-6 animate-fade-in"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.15em] text-cyan-500/50">
            Handler Pipeline
          </h3>
          <p className="text-xs text-gray-700">
            Handlers execute in priority order (top = highest priority)
          </p>
        </div>
      </div>

      {/* Handler list */}
      {handlers.length === 0 ? (
        <p className="text-sm text-gray-700">No handlers configured.</p>
      ) : (
        <div data-testid="handler-list" className="space-y-2">
          {handlers.map((handler, index) => (
            <div key={handler.id} data-testid={`handler-${handler.id}`}>
              {/* Handler row */}
              <div
                className={`flex items-center gap-3 rounded-lg border px-4 py-3 transition-all duration-200 ${
                  editingId === handler.id
                    ? "border-cyan-500/20 bg-cyan-500/[0.04] glow-border"
                    : "border-white/[0.04] bg-surface-50/40 hover:border-white/[0.08]"
                } ${!handler.enabled ? "opacity-40" : ""}`}
              >
                {/* Priority badge */}
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-200 text-xs font-bold text-cyan-400/60 font-mono">
                  {handler.priority}
                </div>

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
                    className="rounded p-0.5 text-gray-700 transition-colors hover:text-cyan-400 disabled:opacity-20"
                    title="Move up"
                  >
                    <svg
                      className="h-4 w-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M5 15l7-7 7 7"
                      />
                    </svg>
                  </button>
                  <button
                    onClick={() => moveHandler(index, 1)}
                    disabled={index === handlers.length - 1}
                    data-testid={`move-down-${handler.id}`}
                    className="rounded p-0.5 text-gray-700 transition-colors hover:text-cyan-400 disabled:opacity-20"
                    title="Move down"
                  >
                    <svg
                      className="h-4 w-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M19 9l-7 7-7-7"
                      />
                    </svg>
                  </button>
                </div>

                {/* Toggle */}
                <button
                  onClick={() => toggleHandler(handler.id)}
                  className={`relative h-6 w-11 shrink-0 rounded-full transition-all duration-300 ${
                    handler.enabled
                      ? "bg-gradient-to-r from-cyan-600 to-teal-600 shadow-glow-sm"
                      : "bg-surface-300"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-300 ${
                      handler.enabled ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>

                {/* Edit button */}
                <button
                  onClick={() => startEdit(handler)}
                  className="rounded p-1.5 text-gray-700 transition-colors hover:bg-white/[0.04] hover:text-cyan-400"
                  title="Edit handler"
                >
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                    />
                  </svg>
                </button>
              </div>

              {/* Inline edit panel */}
              {editingId === handler.id && editDraft && (
                <div className="mt-2 rounded-lg border border-cyan-500/15 bg-surface-50/60 p-4 glow-border animate-slide-up">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-500">
                        Name
                      </label>
                      <input
                        type="text"
                        value={editDraft.name}
                        onChange={(e) =>
                          setEditDraft({ ...editDraft, name: e.target.value })
                        }
                        className="w-full rounded-lg border border-white/[0.06] bg-surface-50/80 px-3 py-1.5 text-sm text-gray-100 outline-none focus:border-cyan-500/30"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-500">
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
                        className="w-full rounded-lg border border-white/[0.06] bg-surface-50/80 px-3 py-1.5 text-sm text-gray-100 outline-none focus:border-cyan-500/30"
                      />
                    </div>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={saveEdit}
                      className="rounded-lg bg-cyan-600/80 px-3 py-1.5 text-xs font-medium text-white transition-all hover:bg-cyan-500/80"
                    >
                      Apply
                    </button>
                    <button
                      onClick={cancelEdit}
                      className="rounded-lg border border-white/[0.06] px-3 py-1.5 text-xs text-gray-500 hover:text-gray-300"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Flow arrow between handlers */}
              {index < handlers.length - 1 && (
                <div className="flex justify-center py-1">
                  <svg
                    className="h-5 w-5 text-gray-800"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M19 14l-7 7m0 0l-7-7m7 7V3"
                    />
                  </svg>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3 border-t border-white/[0.04] pt-6">
        <button
          onClick={handleSave}
          disabled={!dirty || saving}
          className="rounded-lg bg-gradient-to-r from-cyan-600 to-teal-600 px-5 py-2.5 text-sm font-medium text-white shadow-glow-sm transition-all duration-200 hover:shadow-glow disabled:cursor-not-allowed disabled:opacity-30 disabled:shadow-none"
        >
          {saving ? "Saving..." : "Save Changes"}
        </button>
        <button
          onClick={handleReset}
          disabled={!dirty || saving}
          className="rounded-lg border border-white/[0.06] px-5 py-2.5 text-sm font-medium text-gray-500 transition-all duration-200 hover:border-white/[0.12] hover:text-gray-300 disabled:cursor-not-allowed disabled:opacity-30"
        >
          Reset
        </button>
      </div>
    </div>
  );
}
