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
- [ ] 2.2 self-modify.ts 迁移 + config-snapshot-manager.ts
- [ ] 2.3 prompt-fragment-registry.ts + loader 迁移
- [ ] 2.4 memory/ 核心迁移（conversation-history, structured-working-memory, semantic-recall）
- [ ] 2.5 memory tools 迁移（recall-tool, store-memory-tool）
- [ ] 2.6 端到端冒烟测试通过

## 已做决策

（待开发时填写）

## 当前阻塞

无
