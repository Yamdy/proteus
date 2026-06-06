# Phase 1 验证清单

> 阶段切换前必须运行。必须项全部通过才能进入 Phase 2。

## 必须项（Must Pass）

- [ ] `pnpm build` 无 TypeScript 编译错误
- [ ] `pnpm test` 全部通过（无 skip、无 fail）
- [ ] `npx vitest run e2e/phase1-smoke.test.ts` 通过
- [ ] SDK.chat() 能返回 LLM 的文本回复
- [ ] Turn 的 5 个阶段全部执行（通过 OTel Trace 验证）
- [ ] Checkpoint 在 turn:end 时正确保存
- [ ] CostTracker 正确记录 token 用量

## 应该项（Should Pass）

- [ ] 所有旧项目的 .test.ts 文件已迁移（或 handoff 中记录 skip 原因）
- [ ] 无 `any` 类型（除测试 mock）
- [ ] 无未使用的 import
- [ ] handler-engine emit re-entrancy 测试通过
- [ ] HandlerResult 所有变体有测试覆盖

## 可选项（Nice to Have）

- [ ] handler-engine.emit() 单次 < 1ms（100 handler 场景）
- [ ] harness.runTurn() 端到端 < 100ms（mock LLM）
