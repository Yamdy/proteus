# Phase 3 验证清单

> 阶段切换前必须运行。必须项全部通过才能进入 Phase 4。

## 必须项（Must Pass）

- [x] `pnpm build` 无 TypeScript 编译错误（4 packages: core, sdk, server, studio）
- [x] `pnpm test` 全部通过（无 skip、无 fail）
- [x] `npx vitest run e2e/phase3-smoke.test.ts` 通过（13 tests）
- [x] POST /api/chat 返回 LLM 回复
- [x] SSE 流式 token 推送正常
- [x] WebSocket 实时事件推送正常
- [x] SQLite CheckpointStore 可保存和加载 checkpoint
- [x] Session 数据重启后可从 SQLite 恢复
- [x] Studio ChatPanel 可发送消息并实时显示回复
- [x] per-session streaming 状态互不锁定

## 应该项（Should Pass）

- [x] 处理器不重复执行（registerBuiltInProcessors 清空）
- [x] Studio 支持 Session 创建/切换/删除
- [x] 无 `any` 类型（除测试 mock）
- [x] 无未使用的 import

## 可选项（Nice to Have）

- [ ] Studio 支持 Thread 管理
- [ ] Studio Markdown 渲染
- [ ] Studio InfoPanel 显示 Trace 详情
