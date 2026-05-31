import { useCallback, useEffect, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { oneDark } from "@codemirror/theme-one-dark";
import { EditorView } from "@codemirror/view";

interface Level2CodeEditorProps {
  code: string;
  language: string;
  saving: boolean;
  onSave: (code: string) => Promise<void>;
}

// Custom dark theme overrides to match the app
const darkTheme = EditorView.theme({
  "&": {
    backgroundColor: "#0a0a0f",
  },
  ".cm-content": {
    caretColor: "#60a5fa",
  },
  "&.cm-focused .cm-cursor": {
    borderLeftColor: "#60a5fa",
  },
  ".cm-gutters": {
    backgroundColor: "#0a0a0f",
    borderRight: "1px solid #27272a",
    color: "#52525b",
  },
  ".cm-activeLineGutter": {
    backgroundColor: "#18181b",
  },
  ".cm-activeLine": {
    backgroundColor: "#18181b22",
  },
});

export default function Level2CodeEditor({
  code,
  language,
  saving,
  onSave,
}: Level2CodeEditorProps) {
  const [value, setValue] = useState(code);
  const [originalValue, setOriginalValue] = useState(code);
  const [dirty, setDirty] = useState(false);
  const [diffMode, setDiffMode] = useState(false);

  // Sync when external code changes
  useEffect(() => {
    setValue(code);
    setOriginalValue(code);
    setDirty(false);
  }, [code]);

  const handleChange = useCallback((val: string) => {
    setValue(val);
    setDirty(true);
  }, []);

  const handleSave = async () => {
    await onSave(value);
    setOriginalValue(value);
    setDirty(false);
  };

  const handleReset = () => {
    setValue(originalValue);
    setDirty(false);
  };

  // Language extension
  const langExt =
    language === "typescript" || language === "ts"
      ? javascript({ typescript: true })
      : language === "jsx" || language === "tsx"
        ? javascript({ jsx: true, typescript: language === "tsx" })
        : javascript();

  // Compute diff lines (simple line-by-line comparison)
  const diffLines = diffMode ? computeDiff(originalValue, value) : null;

  return (
    <div data-testid="level2-editor" className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-400">
            Code Editor
          </h3>
          <span className="rounded bg-gray-800 px-2 py-0.5 text-[10px] font-medium text-gray-500">
            {language}
          </span>
          {dirty && (
            <span className="rounded bg-yellow-900 px-2 py-0.5 text-[10px] font-medium text-yellow-400">
              Unsaved
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setDiffMode(!diffMode)}
            data-testid="diff-view-btn"
            className={`rounded px-3 py-1.5 text-xs font-medium transition-colors ${
              diffMode
                ? "bg-purple-600 text-white"
                : "border border-gray-700 text-gray-400 hover:border-gray-600 hover:text-gray-200"
            }`}
          >
            {diffMode ? "Exit Diff" : "Diff View"}
          </button>
        </div>
      </div>

      {/* Diff view */}
      {diffMode && diffLines && (
        <div className="rounded-lg border border-gray-800 bg-gray-950 p-4 font-mono text-xs">
          <div className="mb-2 text-[10px] uppercase tracking-wider text-gray-500">
            Changes ({diffLines.filter((l) => l.type !== "same").length} lines)
          </div>
          <div className="max-h-48 overflow-y-auto">
            {diffLines.map((line, i) => (
              <div
                key={i}
                className={`px-2 py-0.5 ${
                  line.type === "added"
                    ? "bg-green-900/30 text-green-400"
                    : line.type === "removed"
                      ? "bg-red-900/30 text-red-400"
                      : "text-gray-500"
                }`}
              >
                <span className="mr-2 inline-block w-4 text-right text-gray-600">
                  {line.type === "added" ? "+" : line.type === "removed" ? "-" : " "}
                </span>
                {line.text || " "}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Editor */}
      <div className="overflow-hidden rounded-lg border border-gray-800">
        <CodeMirror
          value={value}
          onChange={handleChange}
          theme={[oneDark, darkTheme]}
          extensions={[langExt, EditorView.lineWrapping]}
          height="500px"
          basicSetup={{
            lineNumbers: true,
            highlightActiveLineGutter: true,
            highlightActiveLine: true,
            foldGutter: true,
            bracketMatching: true,
            closeBrackets: true,
            autocompletion: true,
            indentOnInput: true,
          }}
        />
      </div>

      {/* Actions */}
      <div className="flex gap-3 border-t border-gray-800 pt-4">
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

// --- Simple diff computation ---

interface DiffLine {
  type: "same" | "added" | "removed";
  text: string;
}

function computeDiff(original: string, current: string): DiffLine[] {
  const origLines = original.split("\n");
  const currLines = current.split("\n");
  const result: DiffLine[] = [];

  // Simple LCS-based diff
  let oi = 0;
  let ci = 0;

  while (oi < origLines.length || ci < currLines.length) {
    if (oi >= origLines.length) {
      result.push({ type: "added", text: currLines[ci] });
      ci++;
    } else if (ci >= currLines.length) {
      result.push({ type: "removed", text: origLines[oi] });
      oi++;
    } else if (origLines[oi] === currLines[ci]) {
      result.push({ type: "same", text: origLines[oi] });
      oi++;
      ci++;
    } else {
      // Look ahead to find next matching line
      let foundOrig = -1;
      let foundCurr = -1;
      for (let look = 1; look < 5; look++) {
        if (ci + look < currLines.length && origLines[oi] === currLines[ci + look]) {
          foundCurr = ci + look;
          break;
        }
        if (oi + look < origLines.length && origLines[oi + look] === currLines[ci]) {
          foundOrig = oi + look;
          break;
        }
      }

      if (foundCurr !== -1) {
        // Lines were added before the match
        while (ci < foundCurr) {
          result.push({ type: "added", text: currLines[ci] });
          ci++;
        }
      } else if (foundOrig !== -1) {
        // Lines were removed before the match
        while (oi < foundOrig) {
          result.push({ type: "removed", text: origLines[oi] });
          oi++;
        }
      } else {
        // Treat as replace
        result.push({ type: "removed", text: origLines[oi] });
        result.push({ type: "added", text: currLines[ci] });
        oi++;
        ci++;
      }
    }
  }

  return result;
}
