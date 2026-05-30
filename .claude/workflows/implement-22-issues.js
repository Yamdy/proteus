export const meta = {
  name: 'retry-failed-issues',
  description: '重试 9 个因 429 限流失败的 issue',
  phases: [
    { title: 'Memory', detail: '4 issues' },
    { title: 'Core', detail: '5 issues' },
  ],
}

const MEMORY_ISSUES = [
  { issue: 75, title: '69-1: VectorMemoryStore', phase: 'Memory', prompt: '替换 packages/memory/src/vector-store.ts stub。实现 put/get/delete/search(cosine similarity top-K + metadata filter)/list。纯 TypeScript cosine similarity。save/load JSON 序列化。参考 kv-store.ts 模式。' },
  { issue: 82, title: '68-2: LLM 摘要模式', phase: 'Memory', prompt: '在 compactor.ts 实现 strategy="llm" 分支：构建摘要 prompt 调用 llmProvider.chat()，内置 prompt 要求保留关键事实 bullet points，LLM 失败时 fallback 到 truncation，空中间区域不调 LLM。注意 compact 方法已经是 async。' },
  { issue: 94, title: '68-3: incremental 摘要', phase: 'Memory', depends: [82], prompt: 'CompactionResult 新增 summary? 字段。incremental 摘要：已有摘要时只摘要新增消息，与旧摘要合并。' },
  { issue: 85, title: '69-4: MemoryManager', phase: 'Memory', depends: [75], prompt: '创建 packages/memory/src/memory-manager.ts。onTurnEnd(messages) 提取记忆写入。beforeContextAssembly(query) 检索注入。配置 autoWrite/autoRead/maxMemoriesPerTurn。index.ts 导出。' },
]

const CORE_ISSUES = [
  { issue: 73, title: '67-1: GovernanceHooks + H1', phase: 'Core', prompt: '创建 packages/core/src/governance.ts。GovernanceHooks 类接收 HandlerEngine。registerBeforeLlm 注册为 context_assembly phase:before 拦截器优先级100。abort 短路 + 链式注册。参考 handler-engine.ts 和 types.ts。index.ts 导出。' },
  { issue: 81, title: '67-4: H4 + suspend', phase: 'Core', depends: [73], prompt: '扩展 governance.ts。registerBeforeResponse(result_observation phase:before)。返回 suspend 暂停 / abort 短路。链式注册。index.ts 导出完整 API。' },
  { issue: 77, title: '71-1: ExecutionEnvironment', phase: 'Core', prompt: '创建 execution-env.ts(接口) + local-execution-env.ts(LocalExecutionEnvironment)。execute 用 child_process.execFile 支持 timeout。readFile/writeFile 用 fs。createSandbox 返回自身。index.ts 导出。' },
  { issue: 88, title: '71-2: SandboxHandle', phase: 'Core', depends: [77], prompt: 'SandboxHandle 接口完整 execute/readFile/writeFile/destroy。SandboxOptions memoryMb/networkAccess/mounts。LocalExecutionEnvironment.createSandbox 返回满足接口对象。' },
  { issue: 89, title: '71-3: ToolExecutionProcessor 注入', phase: 'Core', depends: [77], prompt: 'ToolExecutionProcessor 构造函数接受 executionEnv?。默认 LocalExecutionEnvironment。工具执行通过 executionEnv.execute()。' },
]

// Memory 和 Core 并行执行
const [memoryResults, coreResults] = await parallel([
  () => pipeline(MEMORY_ISSUES, async (issue) => {
    const prompt = `你是一个 TypeScript 代码实现 agent。请实现 GitHub issue #${issue.issue}。

## Issue #${issue.issue}: ${issue.title}

${issue.prompt}

## 要求
1. 代码风格与现有代码一致
2. 新文件在对应 index.ts 中导出
3. 编写单元测试
4. 运行 pnpm test 确保通过
5. 运行 pnpm build 确保编译通过
6. 不要修改不相关的文件
7. TypeScript strict 模式`

    const result = await agent(prompt, {
      label: `issue-${issue.issue}`,
      phase: issue.phase,
    })
    return { issue: issue.issue, title: issue.title, result }
  }),
  () => pipeline(CORE_ISSUES, async (issue) => {
    const prompt = `你是一个 TypeScript 代码实现 agent。请实现 GitHub issue #${issue.issue}。

## Issue #${issue.issue}: ${issue.title}

${issue.prompt}

## 要求
1. 代码风格与现有代码一致
2. 新文件在对应 index.ts 中导出
3. 编写单元测试
4. 运行 pnpm test 确保通过
5. 运行 pnpm build 确保编译通过
6. 不要修改不相关的文件
7. TypeScript strict 模式`

    const result = await agent(prompt, {
      label: `issue-${issue.issue}`,
      phase: issue.phase,
    })
    return { issue: issue.issue, title: issue.title, result }
  }),
])

return { memory: memoryResults, core: coreResults, total: 9 }
