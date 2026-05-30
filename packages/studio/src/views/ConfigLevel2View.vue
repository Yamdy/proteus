<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import Level2CodeEditor from "../components/config/Level2CodeEditor.vue";
import FileTree, { type FileEntry } from "../components/config/FileTree.vue";
import DiffView from "../components/config/DiffView.vue";

// --- File tree data (simulated handler files) ---
const files = ref<FileEntry[]>([
  { path: "handlers/greet.ts", label: "greet.ts", extension: "ts" },
  { path: "handlers/summarize.ts", label: "summarize.ts", extension: "ts" },
  { path: "handlers/classify.ts", label: "classify.ts", extension: "ts" },
  { path: "handlers/translate.ts", label: "translate.ts", extension: "ts" },
  { path: "config/prompts.json", label: "prompts.json", extension: "json" },
  { path: "config/settings.yaml", label: "settings.yaml", extension: "yaml" },
]);

const activePath = ref<string>("");
const editorContent = ref<string>("");
const savedContent = ref<string>("");
const mode = ref<"edit" | "diff">("edit");
const saving = ref(false);
const saveMessage = ref<string | null>(null);
const saveTimeout = ref<ReturnType<typeof setTimeout> | null>(null);

// --- Demo content for each file ---
const demoContent: Record<string, string> = {
  "handlers/greet.ts": `import type { HandlerContext } from "@proteus/core";

/**
 * Greet handler - generates a personalized greeting.
 * Level 2 config: customize the greeting template below.
 */
export async function execute(ctx: HandlerContext): Promise<string> {
  const name = ctx.input.name ?? "World";
  const tone = ctx.config.tone ?? "friendly";

  if (tone === "formal") {
    return \`Good day, \${name}. How may I assist you?\`;
  }

  return \`Hey \${name}! Welcome aboard.\`;
}

export const schema = {
  name: "greet",
  description: "Generates a personalized greeting",
  input: { name: "string" },
  output: "string",
} as const;
`,
  "handlers/summarize.ts": `import type { HandlerContext } from "@proteus/core";

/**
 * Summarize handler - condenses input text.
 * Uses chain-of-thought when enabled in Level 2 config.
 */
export async function execute(ctx: HandlerContext): Promise<string> {
  const text: string = ctx.input.text;
  const maxLength = ctx.config.maxSummaryLength ?? 200;
  const cot = ctx.config.chainOfThoughtEnabled;

  if (cot) {
    // Step-by-step reasoning approach
    const keyPoints = extractKeyPoints(text);
    return keyPoints
      .map((p: string) => \`- \${p}\`)
      .join("\\n")
      .slice(0, maxLength);
  }

  return text.slice(0, maxLength) + (text.length > maxLength ? "..." : "");
}

function extractKeyPoints(text: string): string[] {
  return text
    .split(/[.!?]+/)
    .map((s: string) => s.trim())
    .filter((s: string) => s.length > 10)
    .slice(0, 5);
}

export const schema = {
  name: "summarize",
  description: "Condenses input text into key points",
  input: { text: "string" },
  output: "string",
} as const;
`,
  "handlers/classify.ts": `import type { HandlerContext } from "@proteus/core";

type Category = "question" | "command" | "statement" | "greeting";

/**
 * Classify handler - categorizes user input.
 * Few-shot examples from Level 2 config improve accuracy.
 */
export async function execute(ctx: HandlerContext): Promise<Category> {
  const input: string = ctx.input.text.toLowerCase().trim();
  const fewShot = ctx.config.fewShotExamples ?? [];

  // Check few-shot examples first for exact matches
  for (const example of fewShot) {
    if (input.includes(example.input.toLowerCase())) {
      return example.output as Category;
    }
  }

  // Heuristic fallback
  if (input.endsWith("?")) return "question";
  if (/^(hi|hello|hey|greetings)/i.test(input)) return "greeting";
  if (/^(please|do|run|execute|set|make)/i.test(input)) return "command";

  return "statement";
}

export const schema = {
  name: "classify",
  description: "Categorizes user input text",
  input: { text: "string" },
  output: "string",
} as const;
`,
  "handlers/translate.ts": `import type { HandlerContext } from "@proteus/core";

/**
 * Translate handler - translates text to target language.
 * Custom instructions from Level 2 config affect style.
 */
export async function execute(ctx: HandlerContext): Promise<string> {
  const { text, targetLang } = ctx.input;
  const instructions = ctx.config.customInstructions ?? "";

  // In a real implementation, this would call an LLM
  const styleHint = instructions.includes("formal")
    ? "Use formal register."
    : "Use natural, conversational tone.";

  return \`[Translated to \${targetLang}]: \${text} (Style: \${styleHint})\`;
}

export const schema = {
  name: "translate",
  description: "Translates text to a target language",
  input: { text: "string", targetLang: "string" },
  output: "string",
} as const;
`,
  "config/prompts.json": `{
  "systemPrompts": {
    "default": "You are a helpful AI assistant.",
    "codeReview": "You are a senior software engineer reviewing code. Focus on correctness, readability, and performance.",
    "creative": "You are a creative writing assistant. Be imaginative and expressive."
  },
  "fewShotTemplates": {
    "classification": [
      { "input": "What is the weather?", "output": "question" },
      { "input": "Run the tests", "output": "command" },
      { "input": "Hello there", "output": "greeting" }
    ]
  },
  "chainOfThought": {
    "enabled": false,
    "steps": ["analyze", "reason", "conclude"]
  }
}
`,
  "config/settings.yaml": `# Proteus Level 2 - Strategy Settings
# These override defaults at prompt-assembly time.

model:
  temperature: 0.7
  maxTokens: 4096

strategy:
  chainOfThought: false
  fewShotCount: 3
  retryOnFailure: true
  maxRetries: 2

prompts:
  includeHistory: true
  maxHistoryTurns: 10
  systemPromptSuffix: ""
`,
};

const language = computed<"javascript" | "typescript">(() => {
  if (!activePath.value) return "typescript";
  return activePath.value.endsWith(".ts") ? "typescript" : "javascript";
});

const hasUnsavedChanges = computed(() => {
  return editorContent.value !== savedContent.value;
});

function selectFile(path: string) {
  activePath.value = path;
  const content = demoContent[path] ?? `// Content for ${path}\n`;
  editorContent.value = content;
  savedContent.value = content;
  mode.value = "edit";
  saveMessage.value = null;
}

function handleContentUpdate(value: string) {
  editorContent.value = value;
}

async function saveFile() {
  saving.value = true;
  saveMessage.value = null;
  // Simulate save delay
  await new Promise((r) => setTimeout(r, 400));
  savedContent.value = editorContent.value;
  saving.value = false;
  saveMessage.value = "Saved";
  if (saveTimeout.value) clearTimeout(saveTimeout.value);
  saveTimeout.value = setTimeout(() => {
    saveMessage.value = null;
  }, 2000);
}

function toggleMode() {
  mode.value = mode.value === "edit" ? "diff" : "edit";
}

onMounted(() => {
  // Auto-select first file
  if (files.value.length > 0) {
    selectFile(files.value[0].path);
  }
});
</script>

<template>
  <div class="h-[calc(100vh-3.5rem)] flex flex-col">
    <!-- Header -->
    <div class="shrink-0 px-6 py-4 border-b border-gray-800 bg-gray-900/50">
      <div class="flex items-center gap-2 mb-1">
        <span class="text-[10px] font-mono uppercase tracking-widest text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded">Level 2</span>
      </div>
      <h1 class="text-2xl font-semibold text-gray-100">Strategy Tweaks</h1>
      <p class="mt-1 text-sm text-gray-500">Edit handler files and configuration. Changes apply at prompt assembly time.</p>
    </div>

    <!-- Body: sidebar + editor -->
    <div class="flex-1 flex min-h-0">
      <!-- File tree sidebar -->
      <aside class="w-56 shrink-0 border-r border-gray-800 bg-gray-900/30">
        <div class="px-3 py-2.5 border-b border-gray-800">
          <span class="text-[10px] font-medium uppercase tracking-wider text-gray-500">Handlers</span>
        </div>
        <FileTree :files="files" :active-path="activePath" @select="selectFile" />
      </aside>

      <!-- Editor / Diff area -->
      <div class="flex-1 flex flex-col min-w-0">
        <!-- Toolbar -->
        <div class="shrink-0 flex items-center justify-between px-4 py-2 border-b border-gray-800 bg-gray-900/40">
          <div class="flex items-center gap-2 min-w-0">
            <!-- Active file path -->
            <span v-if="activePath" class="text-xs font-mono text-gray-400 truncate">
              {{ activePath }}
            </span>
            <span v-else class="text-xs text-gray-600 italic">No file selected</span>
            <!-- Unsaved indicator -->
            <span
              v-if="hasUnsavedChanges"
              class="shrink-0 w-2 h-2 rounded-full bg-amber-400"
              title="Unsaved changes"
            />
          </div>

          <div v-if="activePath" class="flex items-center gap-2 shrink-0">
            <!-- Edit / Diff toggle -->
            <button
              @click="toggleMode"
              class="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md border transition-colors"
              :class="
                mode === 'diff'
                  ? 'border-blue-500/40 bg-blue-500/10 text-blue-300'
                  : 'border-gray-700 bg-gray-800 text-gray-400 hover:text-gray-200 hover:border-gray-600'
              "
            >
              <svg v-if="mode === 'edit'" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m5.231 13.481L15 17.25m-4.5-15H5.625c-.621 0-1.125.504-1.125 1.125v16.5c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9zm3.75 11.625a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
              </svg>
              <svg v-else class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
              </svg>
              {{ mode === "edit" ? "View Diff" : "Back to Edit" }}
            </button>

            <!-- Save button -->
            <button
              v-if="mode === 'edit'"
              @click="saveFile"
              :disabled="!hasUnsavedChanges || saving"
              class="flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md transition-colors"
              :class="
                hasUnsavedChanges
                  ? 'bg-blue-600 text-white hover:bg-blue-500'
                  : 'bg-gray-800 text-gray-500 cursor-not-allowed'
              "
            >
              <svg v-if="saving" class="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              {{ saving ? "Saving..." : "Save" }}
            </button>

            <!-- Save message -->
            <span v-if="saveMessage" class="text-xs text-emerald-400 animate-fade-in-out">
              {{ saveMessage }}
            </span>
          </div>
        </div>

        <!-- Editor content -->
        <div class="flex-1 min-h-0">
          <div v-if="!activePath" class="h-full flex items-center justify-center">
            <div class="text-center">
              <svg class="w-12 h-12 mx-auto text-gray-700 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="0.8">
                <path stroke-linecap="round" stroke-linejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
              </svg>
              <p class="text-sm text-gray-500">Select a file from the sidebar to start editing</p>
            </div>
          </div>

          <Level2CodeEditor
            v-else-if="mode === 'edit'"
            :model-value="editorContent"
            :language="language"
            @update:model-value="handleContentUpdate"
            @save="saveFile"
          />

          <DiffView
            v-else
            :original="savedContent"
            :modified="editorContent"
            :language="language"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
@keyframes fadeInOut {
  0% { opacity: 0; transform: translateY(2px); }
  15% { opacity: 1; transform: translateY(0); }
  85% { opacity: 1; }
  100% { opacity: 0; }
}

.animate-fade-in-out {
  animation: fadeInOut 2s ease forwards;
}
</style>
