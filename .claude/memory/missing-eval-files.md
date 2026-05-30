---
name: missing-eval-files
description: PRD #72 的 4 个缺失文件需要重新实现
metadata:
  type: project
---

2026-05-30: 验证 22 个 issue 实现后发现 4 个文件缺失

## 缺失文件（PRD #72: EvaluationHarness）

1. `packages/core/src/evaluation.ts` — Issue #78
2. `packages/core/src/grader.ts` — Issue #90, #91
3. `packages/core/src/failure-attribution.ts` — Issue #92

## 已完成的验证（18/22 通过）

- PRD #67-71: 全部通过
- PRD #72: 只有 #79 (FrozenContext) 通过

**Why:** workflow 并行执行时文件可能被覆盖。
**How to apply:** 使用 workflow 重新实现这 4 个缺失文件。
