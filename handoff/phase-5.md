# Phase 5: 知识共享 + 治理

## 目标

跑通 P2 通路（完整）：跨 Agent 知识共享 + Governance H1-H4 + MCP 工具发现

## User Story

**作为** 一个使用 Proteus 平台的开发者
**我希望能** 让 Agent 读写共享知识库，并通过治理策略控制访问
**这样我就能** 验证知识共享和安全治理可用

### 验收标准

```gherkin
Given  我定义了共享知识库和访问策略
When   Agent A 写入知识，Agent B 尝试读取
Then   - Agent A 写入成功
       - Agent B 读取到 Agent A 写入的知识
       - 如果 Agent B 尝试写入被禁止的知识，PermissionPolicy 阻止
       - AuditLog 记录了所有知识访问操作

Given  Governance H2 钩子配置为需要人工审批
When   Agent 尝试执行被保护的工具
Then   - 返回 suspend，Chain 暂停
       - 人工审批后 resume，Chain 继续
```

**对应 E2E 测试：** `e2e/phase5-smoke.test.ts` ✅ (7 tests)

## 术语约定

- **全局知识（Global Knowledge）**: 跨 Agent、跨 Session 共享的知识存储。
- **H1-H4**: Governance 语义钩子。H1=输入验证，H2=动作验证，H3=输出过滤，H4=人工审批。

## 进度清单

- [x] 5.1 GlobalKnowledgeStore（跨 Session 知识存储）
  - commit: (pending)
  - pnpm build: ✅
  - pnpm test: ✅ (17 tests for knowledge module)
  - 新增文件:
    - `packages/core/src/knowledge/global-knowledge-store.ts`
    - `packages/core/src/knowledge/global-knowledge-store.test.ts`
    - `packages/core/src/knowledge/index.ts`
- [x] 5.2 KnowledgeAccessPolicy（知识访问控制）
  - commit: (pending)
  - pnpm build: ✅
  - pnpm test: ✅ (12 tests for policy module)
  - 新增文件:
    - `packages/core/src/knowledge/knowledge-access-policy.ts`
    - `packages/core/src/knowledge/knowledge-access-policy.test.ts`
  - 策略类: AllowAllPolicy, DenyTagPolicy, OwnerOnlyWritePolicy, CompositePolicy
- [x] 5.3 GovernanceHooks H1-H4 显式映射
  - commit: (pending)
  - pnpm build: ✅
  - pnpm test: ✅ (14 tests for governance module)
  - 新增文件:
    - `packages/core/src/governance/governance-hooks.ts`
    - `packages/core/src/governance/governance-hooks.test.ts`
    - `packages/core/src/governance/index.ts`
  - H1=context_assembly:before, H2=tool_execution:before, H3=tool_execution:after, H4=result_observation:before
- [x] 5.4 MCP Client 集成到 ToolRegistry
  - commit: (pending)
  - pnpm build: ✅
  - pnpm test: ✅ (10 tests)
  - 新增文件:
    - `packages/core/src/mcp/mcp-client.ts`
    - `packages/core/src/mcp/mcp-client.test.ts`
  - Transport 通过 send 回调注入（无 IO 依赖）
- [x] 5.5 MCP Server 暴露自身工具
  - commit: (pending)
  - pnpm build: ✅
  - pnpm test: ✅ (8 tests)
  - 新增文件:
    - `packages/core/src/mcp/mcp-server.ts`
    - `packages/core/src/mcp/mcp-server.test.ts`
    - `packages/core/src/mcp/index.ts`
- [x] 5.6 端到端冒烟测试通过
  - E2E: ✅ (7 tests in e2e/phase5-smoke.test.ts)

## 已做决策

### D5.1: Knowledge 存储实现

**级别: 实现**

- 使用内存 Map 实现 GlobalKnowledgeStore
- 不引入 IO 依赖，符合 core 包约束
- 支持 key/keyPrefix/tags/agentId 查询

### D5.2: MCP Transport 抽象

**级别: 核心**

- MCP Client 的 transport 通过 `send` 回调注入
- 不在 core 包中引入 net/child_process 依赖
- Server/SDK 层负责提供实际 transport 实现（stdio/SSE）

### D5.3: Governance Hooks 映射

**级别: 实现**

- H1-H4 映射到 HandlerEngine 的 interceptor 机制
- 每个 hook 有明确的 phase + event 绑定
- AuditLog 作为 observer 记录所有决策

## 当前阻塞

无
