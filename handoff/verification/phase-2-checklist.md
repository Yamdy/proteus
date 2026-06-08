# Phase 2 验证清单

> 阶段切换前必须运行。必须项全部通过才能进入 Phase 3。

## 必须项（Must Pass）

- [x] `pnpm build` 无 TypeScript 编译错误
- [x] `pnpm test` 全部通过（无 skip、无 fail）
- [x] `npx vitest run e2e/phase2-smoke.test.ts` 通过
- [x] read_file / write_file / list_dir 工具可被 LLM 调用
- [x] self-modify 工具可 register / replace / unregister handler
- [x] ConfigSnapshotManager 可快照和回滚
- [x] recall / store_memory 工具可读写记忆
- [x] MemoryProvider 支持 conversation history + working memory + semantic recall
- [x] 流式 tool_call arguments 增量拼接正确（修复验证）

## 应该项（Should Pass）

- [x] 每个新模块有独立测试文件
- [x] E2E 测试覆盖完整场景（文件读写 + 记忆存储/检索 + 多工具协作）
- [x] 无 `any` 类型（除测试 mock）
- [x] 无未使用的 import

## 可选项（Nice to Have）

- [ ] memory tools 支持嵌入向量语义搜索（真实 embedding provider）
- [ ] self-modify 支持 Trust=2 Worker Thread 隔离执行
