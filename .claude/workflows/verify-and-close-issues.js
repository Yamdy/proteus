export const meta = {
  name: 'verify-and-close-issues',
  description: 'Verify 22 issues completion, commit, push, and close each issue',
  phases: [
    { title: 'Verify', detail: 'Check each issue has correct implementation' },
    { title: 'Commit', detail: 'Commit and push code for each issue' },
    { title: 'Close', detail: 'Close GitHub issues with completion comment' },
  ],
};

// Issue-to-file mapping based on the 22 issues
const ISSUE_MAP = [
  // PRD #67 - GovernanceHooks
  { issue: 73, title: "H1 (before_llm) 钩子", files: ["src/governance.ts", "src/governance.test.ts"], parent: 67 },
  { issue: 80, title: "H2 (before_tool) + PermissionPolicy", files: ["src/governance.ts"], parent: 67 },
  { issue: 93, title: "H3 (after_tool) + 审计日志", files: ["src/governance.ts"], parent: 67 },
  { issue: 81, title: "H4 (before_response) + suspend", files: ["src/governance.ts"], parent: 67 },

  // PRD #68 - ContextCompactor LLM
  { issue: 74, title: "ContextCompactor 接口扩展 + truncation", files: ["packages/memory/src/compactor.ts", "packages/memory/src/compactor.test.ts"], parent: 68 },
  { issue: 82, title: "LLM 摘要模式 + fallback", files: ["packages/memory/src/compactor.ts"], parent: 68 },
  { issue: 94, title: "CompactionResult.summary + incremental", files: ["packages/memory/src/compactor.ts"], parent: 68 },

  // PRD #69 - VectorMemoryStore
  { issue: 83, title: "EmbeddingFunction + MockEmbedding", files: ["packages/memory/src/embedding.ts", "packages/memory/src/embedding.test.ts"], parent: 69 },
  { issue: 75, title: "VectorMemoryStore + cosine search", files: ["packages/memory/src/vector-store.ts", "packages/memory/src/vector-store.test.ts"], parent: 69 },
  { issue: 84, title: "MemoryEntry 扩展 + consolidate()", files: ["packages/memory/src/vector-store.ts"], parent: 69 },
  { issue: 85, title: "MemoryManager 自动记忆生命周期", files: ["packages/memory/src/memory-manager.ts", "packages/memory/src/memory-manager.test.ts"], parent: 69 },

  // PRD #70 - KV-cache
  { issue: 76, title: "KV-cache 前缀稳定 + lastPrefixHash", files: ["src/processors.ts", "src/processors.test.ts"], parent: 70 },
  { issue: 86, title: "PromptFragment chain:start + cache_break", files: ["src/processors.ts"], parent: 70 },

  // PRD #71 - ExecutionEnvironment
  { issue: 77, title: "ExecutionEnvironment 接口", files: ["src/execution-env.ts", "src/execution-env.test.ts"], parent: 71 },
  { issue: 88, title: "SandboxHandle + SandboxOptions", files: ["src/execution-env.ts"], parent: 71 },
  { issue: 89, title: "ToolExecutionProcessor 注入", files: ["src/processors.ts"], parent: 71 },

  // PRD #72 - EvaluationHarness
  { issue: 78, title: "EvaluationHarness 骨架", files: ["src/evaluation.ts", "src/evaluation.test.ts"], parent: 72 },
  { issue: 90, title: "ExactMatchGrader + ContainsGrader", files: ["src/grader.ts", "src/grader.test.ts"], parent: 72 },
  { issue: 91, title: "LLMJudgeGrader", files: ["src/grader.ts"], parent: 72 },
  { issue: 92, title: "失败归因 (ETCLOVG)", files: ["src/failure-attribution.ts", "src/failure-attribution.test.ts"], parent: 72 },

  // PRD #68-3 - FrozenContext
  { issue: 79, title: "FrozenContext capture/restore", files: ["src/context.ts"], parent: 68 },

  // PRD #87 - CostTracker
  { issue: 87, title: "CostTracker cachedTokens + OTel", files: ["src/context.ts"], parent: 87 },
];

async function verifyIssue(agent, issue) {
  const result = await agent(`Verify issue #${issue.issue} (${issue.title}) is correctly implemented.
    Check these files exist and have correct implementation:
    ${issue.files.map(f => `- ${f}`).join('\n')}

    Return JSON: { "ok": boolean, "reason": string }`, {
    label: `verify:#${issue.issue}`,
    phase: 'Verify',
    schema: {
      type: 'object',
      properties: {
        ok: { type: 'boolean' },
        reason: { type: 'string' },
      },
      required: ['ok', 'reason'],
    },
  });
  return { issue, ...result };
}

// Main workflow
const results = [];

// Phase 1: Verify all issues
phase('Verify');
const verifications = await pipeline(
  ISSUE_MAP,
  issue => verifyIssue(agent, issue)
);

const passed = verifications.filter(v => v?.ok);
const failed = verifications.filter(v => !v?.ok);

log(`Verification: ${passed.length} passed, ${failed.length} failed`);

if (failed.length > 0) {
  log('Failed issues:');
  for (const f of failed) {
    log(`  #${f.issue}: ${f.reason}`);
  }
}

// Phase 2: Commit and push (group by parent PRD)
phase('Commit');

// Group changes by parent PRD
const prdGroups = new Map();
for (const issue of passed) {
  const parent = issue.issue.parent;
  if (!prdGroups.has(parent)) {
    prdGroups.set(parent, []);
  }
  prdGroups.get(parent).push(issue);
}

// Commit each PRD group
for (const [prd, issues] of prdGroups) {
  const issueNums = issues.map(i => i.issue.issue);
  const commitMsg = `feat: implement PRD #${prd} issues (${issueNums.join(', ')})

Issues: ${issueNums.map(i => `#${i}`).join(', ')}

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`;

  await agent(`Stage and commit all changes for PRD #${prd}:
    git add -A
    git commit -m "${commitMsg.replace(/"/g, '\\"')}"
    git push

    Return JSON: { "success": boolean, "commit": string }`, {
    label: `commit:PRD#${prd}`,
    phase: 'Commit',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        commit: { type: 'string' },
      },
      required: ['success', 'commit'],
    },
  });
}

// Phase 3: Close issues
phase('Close');

const closeResults = await pipeline(
  passed,
  async (v) => {
    const issue = v.issue;
    return agent(`Close GitHub issue #${issue.issue} with a completion comment:
      gh issue comment ${issue.issue} --body "✅ Implemented in this PR. See commit for details."
      gh issue close ${issue.issue}

      Return JSON: { "closed": boolean }`, {
      label: `close:#${issue.issue}`,
      phase: 'Close',
      schema: {
        type: 'object',
        properties: {
          closed: { type: 'boolean' },
        },
        required: ['closed'],
      },
    });
  }
);

return {
  verified: passed.length,
  failed: failed.length,
  committed: prdGroups.size,
  closed: closeResults.filter(r => r?.closed).length,
};
