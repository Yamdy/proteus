# Phase 5 验证清单

> 阶段切换前必须运行。必须项全部通过才能进入 Phase 6。

## 必须项（Must Pass）

- [x] `pnpm build` 无 TypeScript 编译错误
- [x] `pnpm test` 全部通过（无 skip、无 fail）
- [x] `npx vitest run e2e/phase5-smoke.test.ts` 通过
- [x] GlobalKnowledgeStore 支持跨 Agent 读写
- [x] KnowledgeAccessPolicy 阻止未授权写入
- [x] Governance H1-H4 钩子注册到 HandlerEngine
- [x] AuditLog 记录 governance 决策
- [x] MCP Client 能发现并注册外部工具
- [x] MCP Server 能暴露自身工具
- [x] types.ts 新增类型可从 index.ts 正常导出

## 应该项（Should Pass）

- [x] 每个新模块有独立测试文件
- [x] E2E 测试覆盖完整场景（知识共享 + 策略阻止 + MCP round trip）
- [x] 无 `any` 类型（除测试 mock）
- [x] 无未使用的 import
- [x] knowledge/governance/mcp 模块有 barrel export

## 可选项（Nice to Have）

- [ ] GlobalKnowledgeStore 支持持久化（SQLite）
- [ ] MCP Client 支持 SSE transport
- [ ] Governance hooks 支持动态配置
