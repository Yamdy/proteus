# Phase 3: 服务化

## 目标

跑通 P1 通路：HTTP/WS API + 实时 token 流 + SQLite 持久化 + Checkpoint/Resume

## User Story

**作为** 一个使用 Proteus Server 的用户
**我希望能** 通过 HTTP API 发送消息，通过 WebSocket 收到实时 token 流
**这样我就能** 在浏览器中看到 Agent 实时回复

### 验收标准

```gherkin
Given  Server 已启动，Session 已创建
When   我 POST /api/chat { sessionId: "s1", message: "写一首诗" }
Then   - HTTP 响应状态 200，响应体包含 LLM 回复
       - WebSocket 推送了 token 事件
       - /api/metrics 返回了更新后的指标
       - 重启 Server 后，Session 数据可从 SQLite 恢复
       - resume 可从 Checkpoint 恢复中断的 Chain
```

**对应 E2E 测试：** `e2e/phase3-smoke.test.ts`

## 术语约定

同 Phase 1。

## 进度清单

- [x] 3.1 Server 脚手架（Fastify + CORS + WebSocket）
  - commit: (proteus-platform) Phase 3 initial
  - 新增: packages/server/ (server.ts, start.ts, routes/*)
- [x] 3.2 SessionManager 重写（并发安全）
  - commit: (proteus-platform) Phase 3 initial
  - 新增: runWithLock() per-session 异步锁
- [x] 3.3 SQLite CheckpointStore 迁移
  - commit: (proteus-platform) Phase 3 initial
  - 新增: packages/core/src/sqlite-checkpoint-store.ts
- [x] 3.4 routes/chat.ts（同步推理 + SSE 流式）
  - commit: (proteus-platform) Phase 3 initial
  - 新增: POST /api/chat + POST /api/sessions/:id/stream
- [x] 3.5 routes/sessions.ts + routes/status.ts + routes/metrics.ts
  - commit: (proteus-platform) Phase 3 initial
  - 新增: CRUD + 状态 + 指标 + 成本 + 追踪
- [x] 3.6 routes/ws.ts（EventBus WebSocket 推送）
  - commit: (proteus-platform) Phase 3 initial
  - 新增: WebSocket 实时事件推送
- [x] 3.7 Studio 最小可用（ChatPanel + 实时 token 流）
  - commit: a01065c (proteus-platform)
  - pnpm build: ✅ (4 packages: core, sdk, server, studio)
  - pnpm test: ✅ (123 tests: 112 core + 11 studio)
  - E2E: ✅ 真实 DeepSeek API 端到端验证
  - 新增: packages/studio/ (React + Zustand + Vite + Tailwind)
  - 功能: Session 创建/切换/删除、SSE 流式聊天、per-session streaming 状态
- [x] 3.8 Checkpoint/Resume 端到端验证
  - commit: (proteus-platform) Phase 3 initial
  - E2E 测试覆盖
- [x] 3.9 端到端冒烟测试通过
  - commit: (proteus-platform) Phase 3 initial
  - 13/13 server tests passed

## 已做决策

### D3.1: Studio 用 React（非 Vue）
**级别: 实现**
handoff/phase-3.md 原文写 Vue 3 有误。原仓库 Studio 是 React + Zustand，迁移按 React 实现。

### D3.2: Studio 最小范围
**级别: 实现**
只迁移 ChatPanel + SessionSidebar + MessageBubble。不含 InfoPanel、Thread 管理、路由、Markdown 渲染。

### D3.3: 处理器双重执行修复
**级别: 核心**
`registerBuiltInProcessors()` 把处理器注册为 `phase:before` 事件 handler，harness 又通过 `runProcessor()` 直接调用，导致 LLM 被调用两次、SSE 流式回复内容重复。
修复：清空 `registerBuiltInProcessors` 函数体。根据 D5 设计，处理器由 harness 直接调用。

### D3.4: per-session streaming 状态
**级别: 实现**
`isStreaming` 原为 ChatArea 组件本地状态，session A 流式回复时锁住所有 session 输入框。
修复：`streamingSessions: Set<string>` 放入 Zustand store，per-session 跟踪。

## 当前阻塞

无

## 验证结果

| 检查项 | 状态 |
|--------|------|
| `pnpm build` | ✅ 4 packages (core, sdk, server, studio) |
| `pnpm test` | ✅ 123 tests (112 core + 11 studio) |
| E2E server | ✅ 13 tests |
| SSE 流式 | ✅ 真实 DeepSeek API |
| 并发 session | ✅ per-session streaming 不互相锁定 |
