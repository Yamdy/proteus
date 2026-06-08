# Phase 4 验证清单

> 阶段切换前必须运行。必须项全部通过才能进入 Phase 5。

## 必须项（Must Pass）

- [x] `pnpm build` 无 TypeScript 编译错误（4 packages）
- [x] `pnpm test` 全部通过（无 skip、无 fail）
- [x] `npx vitest run e2e/phase4-smoke.test.ts` 通过（8 tests）
- [x] AgentRegistry 可 register / get / has / list / unregister AgentContext
- [x] AgentRouter.delegate() 可跨 Agent 委托任务
- [x] SubHarness 三种隔离模式（full / shared / summary）可用
- [x] Agent-as-Tool 包装 Agent 为可调用工具
- [x] OTel Trace 树包含跨 Agent parent-child Span
- [x] CostAttributionTracker 递归归因子 Agent 成本

## 应该项（Should Pass）

- [x] 每个新模块有独立测试文件
- [x] E2E 测试覆盖完整委托流 + OTel + 成本归因
- [x] 无 `any` 类型（除测试 mock）
- [x] 无未使用的 import
- [x] delegation 事件（start/end/error）正确发射

## 可选项（Nice to Have）

- [ ] SubHarness summary 模式支持 LLM 摘要压缩
- [ ] AgentRouter 支持负载均衡（多实例路由）
