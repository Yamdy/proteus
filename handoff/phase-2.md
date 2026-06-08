# Phase 2: 带工具的 Agent

## 目标

跑通 P0+ 通路：Agent 能调用工具（文件读写）+ 记忆读写

## User Story

**作为** 一个使用 Proteus SDK 的开发者
**我希望能** 给 Agent 注册工具，让 Agent 能读写文件和记忆
**这样我就能** 验证工具调用链路和记忆系统完整

### 验收标准

```gherkin
Given  我注册了 read_file / write_file 工具和 recall / store_memory 工具
When   我发送 "在当前目录创建 hello.txt，内容是 'hello world'"
Then   - LLM 决定调用 write_file 工具
       - 工具执行成功，文件被创建，内容正确
       - 工具结果返回给 LLM，LLM 生成确认回复
       - OTel Trace 中有 tool_execution 的 Span

Given  我之前和 Agent 讨论过 "我喜欢 TypeScript"
When   我发送 "我之前说过喜欢什么语言？"
Then   - Agent 通过 recall 工具检索到相关记忆
       - 回复中包含 "TypeScript"
```

**对应 E2E 测试：** `e2e/phase2-smoke.test.ts`

## 术语约定

同 Phase 1。

## 进度清单

- [x] 2.1 内置工具迁移（read_file, write_file, list_dir）
  - commit: 7a78a02 (proteus-platform)
  - pnpm build: ✅
  - pnpm test: 8/8 pass
  - 新增文件: packages/core/src/tools/built-in.ts, packages/core/src/tools/built-in.test.ts
- [x] 2.2 self-modify.ts 迁移 + config-snapshot-manager.ts
  - commit: bfc8b33 (proteus-platform)
  - pnpm build: ✅ (0 errors)
  - pnpm test: 45/45 pass (0 skip)
  - 新增文件: packages/core/src/self-modify.ts, packages/core/src/self-modify.test.ts, packages/core/src/config-snapshot-manager.ts, packages/core/src/config-snapshot-manager.test.ts
- [x] 2.3 prompt-fragment-registry.ts + loader 迁移
  - 发现：目标仓库中已存在且与源文件完全相同，无需迁移
- [x] 2.4 memory/ 核心迁移（conversation-history, structured-working-memory, semantic-recall）
  - commit: af7186d (proteus-platform)
  - pnpm build: ✅ (0 errors)
  - pnpm test: 96/96 pass (0 skip)
  - 新增文件: memory/truncation.ts, memory/conversation-history.ts, memory/structured-working-memory.ts, memory/semantic-recall.ts, memory/in-memory-embedding-provider.ts + 4 个测试文件
- [x] 2.5 memory tools 迁移（recall-tool, store-memory-tool）
  - commit: 137eab9 (proteus-platform)
  - pnpm build: ✅ (0 errors)
  - pnpm test: 112/112 pass (0 skip)
  - 新增文件: memory/tools/recall-tool.ts, memory/tools/store-memory-tool.ts, memory/tools/index.ts, memory/__tests__/memory-tools.test.ts
- [x] 2.6 端到端冒烟测试通过
  - commit: 5c66e5f (proteus-platform)
  - E2E 测试: 5/5 pass (mock LLM + 真实工具 + 真实记忆系统)
  - 覆盖: 文件读写工具调用、记忆存储/检索、多工具协作

## 已做决策

（待开发时填写）

## 当前阻塞

无

## Bug 修复记录

### 2.7 流式 tool_call arguments 解析修复（2026-06-07）

**症状：** hello-agent 示例中 DeepSeek 返回 tool_call 但文件未创建
**根因：** `openai-chat.ts` 的 `chatStream()` 中，SSE 流的 `arguments` 是增量片段，原代码对每个片段 `JSON.parse()` 全部失败，`arguments` 始终为 `{}`
**影响范围：** Proteus 原仓库 + proteus-platform（迁移时原封不动带入）
**修复内容：**

1. `chatStream()`: 累积原始字符串片段，yield 时一次性 `JSON.parse()`
2. `mapMessages()`: assistant 消息带上 `tool_calls`（多轮对话修复）
3. `harness.ts`: 增加 `PROTEUS_DEBUG=1` 条件日志

**验证：**

- pnpm build: ✅
- pnpm test: 112/112 pass
- E2E: 10/10 pass（deepseek-smoke 因无 key 预期失败）
- hello-agent 端到端: ✅（DeepSeek API → tool_call → 文件创建）

**教训：** mock 测试绕过了 SSE 流式解析逻辑，真实 bug 被掩盖。已在 CLAUDE.md 新增「迁移验证规则」。

**涉及文件：**

- `packages/core/src/llm/protocols/openai-chat.ts`（主修复）
- `packages/core/src/harness.ts`（调试日志）
- `examples/hello-agent.ts`（支持 env 变量配置 model/baseUrl）
- `CLAUDE.md`（新增迁移验证规则）
