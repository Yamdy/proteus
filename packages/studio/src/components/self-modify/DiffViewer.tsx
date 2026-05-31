import { useCallback, useMemo } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { oneDark } from "@codemirror/theme-one-dark";
import type { ModifyDetail } from "../../hooks/useSelfModify";

interface DiffViewerProps {
  detail: ModifyDetail | null;
  onRollback: (commitId: string) => void;
  onClose: () => void;
  rollingBack: boolean;
}

function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleString();
}

/**
 * Simple side-by-side diff viewer.
 * If @codemirror/merge is available, this can be upgraded to a
 * unified merge view. For now we render a clean before/after split.
 */
export default function DiffViewer({
  detail,
  onRollback,
  onClose,
  rollingBack,
}: DiffViewerProps) {
  const handleRollback = useCallback(() => {
    if (detail && confirm(`Rollback "${detail.handlerName}" to previous state?`)) {
      onRollback(detail.commitId);
    }
  }, [detail, onRollback]);

  const beforeContent = useMemo(
    () => detail?.diff?.before ?? "// No previous state recorded",
    [detail],
  );

  const afterContent = useMemo(
    () => detail?.diff?.after ?? "// No changes recorded",
    [detail],
  );

  if (!detail) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-gray-500">
        Select a modification to view details
      </div>
    );
  }

  return (
    <div data-testid="diff-viewer" className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-800 px-4 py-3">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-white">
              {detail.handlerName}
            </span>
            <span className="rounded bg-gray-800 px-1.5 py-0.5 text-[10px] font-bold uppercase text-gray-400">
              {detail.action}
            </span>
          </div>
          <p className="text-xs text-gray-400">{detail.message}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRollback}
            disabled={rollingBack}
            data-testid="rollback-btn"
            className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-red-500 disabled:opacity-50"
          >
            {rollingBack ? "Rolling back..." : "Rollback"}
          </button>
          <button
            onClick={onClose}
            className="rounded-md px-2 py-1.5 text-xs text-gray-400 transition-colors hover:bg-gray-800 hover:text-white"
          >
            Close
          </button>
        </div>
      </div>

      {/* Metadata */}
      <div className="flex items-center gap-4 border-b border-gray-800 px-4 py-2 text-[10px] text-gray-500">
        <span>Commit: <span className="font-mono text-gray-400">{detail.commitId.slice(0, 7)}</span></span>
        <span>Time: {formatTimestamp(detail.timestamp)}</span>
        {detail.traceId && (
          <span>
            Trace: <span className="font-mono text-gray-400">{detail.traceId}</span>
          </span>
        )}
      </div>

      {/* Diff view - side by side */}
      <div className="flex flex-1 overflow-hidden">
        {/* Before */}
        <div className="flex flex-1 flex-col border-r border-gray-800">
          <div className="border-b border-gray-800 px-3 py-1.5 text-xs font-medium text-red-400">
            Before
          </div>
          <div className="flex-1 overflow-auto">
            <CodeMirror
              value={beforeContent}
              theme={oneDark}
              extensions={[javascript()]}
              readOnly
              editable={false}
              basicSetup={{
                lineNumbers: true,
                foldGutter: false,
                highlightActiveLine: false,
              }}
              style={{ height: "100%", fontSize: "12px" }}
            />
          </div>
        </div>

        {/* After */}
        <div className="flex flex-1 flex-col">
          <div className="border-b border-gray-800 px-3 py-1.5 text-xs font-medium text-green-400">
            After
          </div>
          <div className="flex-1 overflow-auto">
            <CodeMirror
              value={afterContent}
              theme={oneDark}
              extensions={[javascript()]}
              readOnly
              editable={false}
              basicSetup={{
                lineNumbers: true,
                foldGutter: false,
                highlightActiveLine: false,
              }}
              style={{ height: "100%", fontSize: "12px" }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
