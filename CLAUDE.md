# Proteus Agent Platform

## 项目定位

Agent Harness 平台，不是 Agent Framework。提供 Agent 运行环境，不定义 Agent 是什么。

## 技术栈

- TypeScript 5.x strict mode · ES2023 · NodeNext modules
- Node.js 20+
- pnpm workspaces + Turborepo
- Vitest（测试）· Zod（Schema）· better-sqlite3（持久化）
- Fastify v5（Server）· Vue 3 + Vite + Tailwind + Pinia（Studio）

## 包结构

```
packages/core/          核心引擎（无 IO 依赖）
packages/agents/        多 Agent 协作层
packages/knowledge/     知识层
packages/tools/         工具层（含 MCP 适配）
packages/governance/    治理层
packages/observability/ 可观测层
packages/server/        HTTP/WebSocket 服务
packages/sdk/           嵌入式 API
packages/studio/        浏览器 UI
```

## 编码规范

- 函数优先 async/await，不用 callback
- 错误处理用 Go 风格返回值 `{ ok: true } | { ok: false, reason }`，不用 try-catch（IO 边界除外）
- 测试文件与源文件同目录，命名 `*.test.ts`
- 每个包独立可发布，包间依赖通过 `index.ts` 公开接口
- types.ts 中只用 interface + type，不用 class
- Zod Schema 是单一来源：TypeScript 类型、JSON Schema、运行时校验都从 Zod 派生

## 禁止事项

- 不得修改已有的 ADR 文档（只能新增）
- 不得在 core 包中引入 IO 依赖（fs/net/http）
- 不得删除任何 .test.ts 文件（只能修改或新增）
- 不得在未更新 handoff 文档的情况下修改公共接口签名
- 不得跳过阶段验证清单直接进入下一阶段

## 工作流程（Handoff 协议）

### Session 启动

1. 读取本文件（CLAUDE.md）了解项目约定
2. 读取 `handoff/phase-N.md` 了解当前阶段上下文
3. 读取最新的 `handoff/session-log/` 了解上次进展
4. 基线验证（见下方「基线验证」一节）
5. 范围确认（见下方「范围纪律」一节）
6. 从第一个未完成项开始

### Session 结束

1. 运行 `pnpm build` + `pnpm test`，确保通过
2. 更新 `handoff/phase-N.md`：标记完成项（附带基线锚点）、记录决策、更新接口契约
3. 写 `handoff/session-log/YYYY-MM-DD-HH.md`
4. Git commit

### 阶段切换

1. 运行 `handoff/verification/phase-N-checklist.md` 中所有必须项
2. 运行 `e2e/phaseN-smoke.test.ts` 端到端冒烟测试
3. 全部通过后才能更新 phase-N.md 标记阶段完成
4. 创建 phase-(N+1).md

### 迁移验证规则

迁移代码不能只靠 mock 测试。以下场景必须有真实 API/环境的集成测试：

| 场景 | 必须验证 | 原因 |
| ---- | -------- | ---- |
| 流式处理（SSE/WebSocket） | 至少一次真实 API 端到端调用 | mock 返回完整对象，绕过了增量拼接逻辑 |
| 文件 I/O | 验证文件实际落盘 | mock 可以返回成功但文件未写入 |
| 网络协议 | 真实请求-响应周期 | wire format 差异（分片、编码、时序）mock 无法模拟 |
| 序列化/反序列化 | 用真实数据结构测试 | 边界情况（空值、Unicode、大对象）mock 容易遗漏 |

**教训来源：** 2026-06-07 调试 hello-agent — `openai-chat.ts` 的 `chatStream()` 中 `tool_calls.arguments` 流式拼接 bug 原仓库就有，迁移时 mock 测试掩盖了问题，直到真实 DeepSeek API 调用才发现。

### Handoff 文档改动规则

Handoff 文档是活文档，不是合同。计划服务于开发，不是开发服务于计划。
如果文档和现实冲突，改文档，不改现实。

**能改什么：**

| 内容 | 能改吗 | 规则 |
| ---- | ------ | ---- |
| 阶段划分 | 能 | 合并/拆分/重排都可以，在原阶段 handoff 中记录"为什么调整" |
| 进度清单 | 随时加 | 新发现的项直接追加。已完成的项不能删（留作记录） |
| 接口契约 | 能改 | 必须记录：改了什么、为什么改、影响哪些下游模块 |
| 已做决策 | 能推翻 | 新决策覆盖旧决策，旧决策保留不删除，标注"被 D-N 取代" |
| 验证清单 | 能加不能减 | 可以追加新的必须项，不能把必须项降级为可选来跳过验证 |
| 源文件映射 | 能改 | 实际迁移时发现映射不对，直接更新 |

**改动记录方式：**

进度清单 — 直接加行，用子编号标记新增项：

```markdown
- [x] 1.1 新建 monorepo
- [ ] 1.3 schemas/ 迁移
- [ ] 1.3.1 发现需额外迁移 schemas/traces.ts（原清单遗漏）
```

接口契约 — 在变更处加 `[YYYY-MM-DD 修改]` 注释：

```markdown
> [2026-06-09 修改] ChainResult 增加 turnResults 字段。
> 原因：Studio 需要每个 Turn 的结果来渲染对话历史。
> 影响：SDK.chat() 返回值类型变更。
```

决策推翻 — 旧决策保留，新决策标注取代关系：

```markdown
### D5: harness.ts 重写设计
> [被 D5.1 取代] 原设计让 Harness 独立调用 Processor...

### D5.1: harness.ts 重写设计（修订）
（新设计...）
```

阶段合并 — 在新阶段 handoff 开头说明：

```markdown
> [2026-06-10] 原计划 Phase 2 + Phase 3 合并。
> 原因：工具注册需要 Server API，不做 Server 无法验证完整通路。
```

Session Log — 如实记录偏差：

```markdown
## 对 handoff 文档的修改
- phase-1.md D8 新增：context.ts 构造函数副作用修复
- phase-1.md 源文件映射：context.ts 从"零改动"改为"小改"
```

### 基线验证

每个已完成的进度项必须附带基线锚点，证明代码库状态与文档一致：

```markdown
- [x] 1.2 types.ts 迁移
  - commit: def5678
  - pnpm build: ✅ (0 errors)
  - pnpm test: 47/47 pass (0 skip)
  - 新增文件: packages/core/src/types.ts, packages/core/src/types.test.ts
```

新 Session 启动时执行基线验证：

1. `git log --oneline -1` — 确认 HEAD 与最后一个完成项的 commit 一致
2. `pnpm build` — 确认通过
3. `pnpm test` — 确认通过
4. 不一致 → 回滚到上一个已验证 commit（见「回滚机制」）

### 进度真实性验证

Session 结束标记完成时，必须同时满足：

1. 代码已写入文件
2. `pnpm build` 通过（0 errors）
3. `pnpm test` 通过（0 fail, 0 skip，除非 skip 原因已记录在 handoff 中）
4. 相关测试文件已创建或已迁移

只有代码写完但没跑通 build/test 的，不能标记为完成。
可以标记为 `[进行中]` 并在 session log 中记录阻塞原因。

### 决策权限边界

Handoff 中的每个决策必须标注级别，不同级别有不同的改动门槛：

| 级别 | 含义 | 改动门槛 |
| ---- | ---- | -------- |
| **架构** | 影响整体结构（如五阶段模型、事件总线模式） | 必须新增 ADR，记录完整权衡分析 |
| **核心** | 影响阶段内关键路径（如 harness 重写策略） | 必须在 phase handoff 中记录理由和影响分析 |
| **实现** | 具体实现细节（如 token 计数用估算） | 直接改，记录在 session log |

在 handoff 中标注方式：

```markdown
### D5: harness.ts 重写设计
**级别: 核心** — 推翻需在 phase handoff 中记录理由

### D7: 测试迁移策略
**级别: 实现** — 可根据实际情况调整
```

### 回滚机制

如果 Session 启动时基线验证不通过，或发现代码状态异常：

1. `git log --oneline -10` — 查找最近的 commit
2. 找到 handoff 中最后一个标记为「已验证」的 commit hash
3. `git reset --hard <commit>` — 回滚到该点
4. 在 handoff 中记录回滚：

```markdown
## 回滚记录
- [2026-06-09] 回滚到 def5678
- 原因：上一个 Session 标记 1.3 完成，但 pnpm test 有 3 个 fail
- 丢弃的 commit: aaa111, bbb222, ccc333
- 从 1.3 重新开始
```

- 从回滚点重新开始工作

### 范围纪律

每次 Session 只允许修改当前阶段进度清单中列出的文件。
不允许修改其他阶段的文件，即使发现了问题。

如果发现问题需要后续阶段处理，在 handoff 中记录为「发现」：

```markdown
## 发现（不立即处理）
- [发现] Memory 系统的 WorkingMemory 和 MemoryProvider 双轨问题，建议在阶段 2 处理
- [发现] Server 的单 AgentContext 共享问题，建议在阶段 3 处理
```

不允许在当前阶段：

- 重构不在清单中的模块
- 新增不在清单中的依赖
- 优化不在清单中的性能问题

### 术语同步

每个阶段的 handoff 中维护术语表，确保不同 Session 对同一概念理解一致：

```markdown
## 术语约定

- **迁移**: 从旧项目复制源文件到新项目，修改 import 路径以适配新包结构。
  不改变业务逻辑、接口签名、测试断言。
- **零改动**: 迁移时只改 import 路径，不改任何其他内容。
- **小改**: 迁移时除 import 路径外，还需修改 1-3 处业务代码（如 bug 修复）。
- **重写**: 保留设计意图但重新实现代码，允许改变实现细节。
- **完成**: 代码写完 + build 通过 + test 通过。只有代码写完不算完成。
- **已验证**: 完成 + commit + 基线锚点已记录在 handoff 中。
```

## 文档结构

```
docs/architecture.md        完整架构蓝图
docs/adr/                   架构决策记录（不可修改已有，可新增）
handoff/phase-N.md          阶段 Handoff 文档（上下文、决策、接口契约）
handoff/session-log/        Session 工作日志
handoff/verification/       阶段验证清单
e2e/                        端到端冒烟测试
```

## 设计参考

- 架构蓝图：`docs/architecture.md`
- ADR 记录：`docs/adr/0001~0004`
- ETCLOVG 分类：`docs/prd-etclovg-harness.md`
- 领域术语：`CONTEXT.md`
