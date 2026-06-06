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

- [ ] 3.1 Server 脚手架（Fastify + CORS + WebSocket）
- [ ] 3.2 SessionManager 重写（并发安全）
- [ ] 3.3 SQLite CheckpointStore 迁移
- [ ] 3.4 routes/chat.ts（同步推理 + SSE 流式）
- [ ] 3.5 routes/sessions.ts + routes/status.ts + routes/metrics.ts
- [ ] 3.6 routes/ws.ts（EventBus WebSocket 推送）
- [ ] 3.7 Studio 最小可用（ChatPanel + 实时 token 流）
- [ ] 3.8 Checkpoint/Resume 端到端验证
- [ ] 3.9 端到端冒烟测试通过

## 已做决策

（待开发时填写）

## 当前阻塞

无
