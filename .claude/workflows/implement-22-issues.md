---
name: implement-22-issues
description: 并行实现 22 个 PRD 子任务 issue（memory + core 两个 worktree）
---

# Implement 22 PRD Issues

并行启动两个 agent，分别在独立 worktree 中实现 memory 包和 core 包的所有 issue。

## Phase 1: Memory 包 (7 issues)

在 worktree `wt-memory` 中按依赖顺序实现：

### Chain A: ContextCompactor LLM 摘要
1. **#74 (68-1)** — ContextCompactor 接口扩展 + truncation 回归
   - 修改 `packages/memory/src/compactor.ts`
   - 新增可选参数：llmProvider?, summaryStrategy?, summaryMaxTokens?, summaryPrompt?
   - 默认 "truncation"，向后兼容
   - 确保现有测试通过

2. **#82 (68-2)** — LLM 摘要模式 + graceful fallback
   - 实现 strategy="llm" 分支
   - 内置摘要 prompt（保留关键事实、bullet points）
   - LLM 失败时降级到 truncation

3. **#94 (68-3)** — CompactionResult.summary + incremental 摘要
   - CompactionResult 新增 summary? 字段
   - incremental：只摘要新增中间消息，与旧摘要合并

### Chain B: VectorMemoryStore
4. **#75 (69-1)** — VectorMemoryStore + cosine similarity + save/load
   - 替换 `packages/memory/src/vector-store.ts` stub
   - 实现 put/get/delete/search/list
   - cosine similarity 纯 TypeScript 实现
   - save/load JSON 序列化

5. **#83 (69-2)** — EmbeddingFunction + MockEmbeddingFunction
   - 类型定义 + Mock 实现
   - VectorMemoryStore 构造函数接受 embeddingFn?

6. **#84 (69-3)** — consolidate() 去重
   - 检测相似 embedding（>0.95）
   - 合并：取较高 importance，合并 metadata

7. **#85 (69-4)** — MemoryManager 自动生命周期
   - onTurnEnd(messages) — 提取记忆写入
   - beforeContextAssembly(query) — 检索注入

## Phase 2: Core 包 (15 issues)

在 worktree `wt-core` 中按依赖顺序实现：

### Chain A: GovernanceHooks
1. **#73 (67-1)** — GovernanceHooks 骨架 + H1 (before_llm)
   - 创建 `packages/core/src/governance.ts`
   - registerBeforeLlm → context_assembly phase:before
   - 支持 abort 短路 + 链式注册

2. **#80 (67-2)** — H2 + PermissionPolicy (AllowAll + DenyList)
   - registerBeforeTool → tool_execution phase:before
   - PermissionPolicy 接口 + 两个内置实现
   - 拒绝时写入 governance:decision 事件

3. **#93 (67-3)** — H3 + 审计日志
   - registerAfterTool → tool_execution phase:after
   - governance:decision 事件写入 CheckpointStore

4. **#81 (67-4)** — H4 + suspend 人在回路
   - registerBeforeResponse → result_observation phase:before
   - 返回 suspend 暂停执行

### Chain B: KV-cache 感知
5. **#76 (70-1)** — 前缀稳定 + 追加式构建 + lastPrefixHash
   - 修改 ContextAssemblyProcessor
   - system messages 永远排最前
   - 新消息追加到末尾

6. **#86 (70-2)** — PromptFragment 一次性注入 + cache_break
   - chain:start 时注入，后续 turn 不变
   - prefix 变化时发出 context:cache_break

7. **#87 (70-3)** — CostTracker cachedTokens + OTel
   - 解析 cache_creation/cache_read tokens
   - OTel metrics: proteus.tokens.cached

### Chain C: ExecutionEnvironment
8. **#77 (71-1)** — 接口 + LocalExecutionEnvironment
   - 创建 execution-env.ts + local-execution-env.ts
   - execute/readFile/writeFile/createSandbox

9. **#88 (71-2)** — SandboxHandle + SandboxOptions
   - 接口完整实现
   - V1 沙箱返回自身

10. **#89 (71-3)** — ToolExecutionProcessor 注入
    - 构造函数接受 executionEnv?
    - 默认 LocalExecutionEnvironment

### Chain D: EvaluationHarness
11. **#79 (72-4)** — FrozenContext capture/restore
    - 扩展 FrozenContext
    - capture → serialize → deserialize → restore 往返

12. **#78 (72-1)** — EvaluationHarness 骨架 + runSuite
    - 创建 evaluation.ts
    - 包装 Harness，运行 EvalSuite → EvalReport

13. **#90 (72-2)** — ExactMatchGrader + ContainsGrader
    - 精确匹配（trim/caseInsensitive）
    - 关键词包含（比例评分）

14. **#91 (72-3)** — LLMJudgeGrader
    - LLM 评判开放式输出
    - 结构化返回 pass/score/reason

15. **#92 (72-5)** — 失败归因 + 持久化
    - ETCLOVG 层映射
    - 结果写入 CheckpointStore
