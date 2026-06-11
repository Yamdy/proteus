# Phase 6: 多租户 + 声明式

## 目标

平台化：多租户隔离 + YAML 声明式 Agent 定义 + Studio 多 Agent 可视化

## User Story

**作为** 一个平台管理员
**我希望能** 用 YAML 定义 Agent，多个租户的 Agent 互相隔离
**这样我就能** 验证平台化可用

### 验收标准

```gherkin
Given  我有一个 agent.yaml 定义文件
When   我执行 npx proteus run agent.yaml
Then   - Agent 按 YAML 定义的配置启动
       - 使用指定的 LLM、工具、治理策略
       - Tenant A 的 Agent 看不到 Tenant B 的数据
       - Token 用量按租户独立计量
       - Studio 能可视化所有 Agent 的实时状态和 Trace 树
```

**对应 E2E 测试：** `e2e/phase6-smoke.test.ts`

## 术语约定

- **Tenant Context**: 租户隔离层，位于 AgentContext 之上。
- **Agent Manifest**: YAML 格式的 Agent 声明式定义，编译为运行时配置。

## 进度清单

- [x] 6.1 TenantContext + QuotaManager
  - commit: efa8a7f
  - pnpm build: ✅ (0 errors)
  - pnpm test: 266/266 pass (0 skip)
  - 新增文件: packages/core/src/tenant/tenant-context.ts, quota-manager.ts, tenant-registry.ts, index.ts + 3 test files
- [x] 6.2 Agent Manifest Schema（Zod）
  - commit: efa8a7f
  - 新增文件: packages/core/src/manifest/manifest-schema.ts
  - Schema: AgentManifestSchema + 6 nested schemas (LLM, Tool, Governance, Memory, Knowledge, Quota, McpServer)
- [x] 6.3 Manifest → Runtime 编译器
  - commit: efa8a7f
  - 新增文件: packages/core/src/manifest/manifest-compiler.ts + test
  - 函数: compileManifest(), parseManifestYaml()
- [x] 6.4 Server 多租户路由 + 配额检查
  - commit: efa8a7f
  - 新增文件: packages/server/src/routes/tenants.ts
  - 路由: POST /api/manifest/run, GET /api/tenants, GET /api/tenants/:id, GET /api/tenants/:id/usage
- [x] 6.5 Studio 多 Agent 可视化（Trace 树 + 状态面板）
  - commit: efa8a7f
  - 新增文件: packages/studio/src/stores/agentStore.ts, components/agents/AgentPanel.tsx, TraceTree.tsx
- [x] 6.6 端到端冒烟测试通过
  - commit: efa8a7f
  - 12/12 E2E tests passing
  - 新增文件: e2e/phase6-smoke.test.ts

## 已做决策

### D1: YAML 解析放在 Server 层，不放 Core
**级别: 实现**
- 原因: Core 包保持 IO-free，yaml 包是 IO 依赖
- 方案: parseManifestYaml() 接受可选 yamlParser 回调，Server 层传入 yaml 包的解析函数
- 影响: 无，纯实现细节

### D2: dotenv 自动加载 .env 配置
**级别: 实现**
- 原因: 用户不想每次手动配置 API key
- 方案: 在 packages/server/start.ts 顶部 import "dotenv/config"
- 配置: DEEPSEEK_API_KEY, PROTEUS_LLM_BASE_URL, PROTEUS_LLM_MODEL

### D3: QuotaManager 配额周期自动重置
**级别: 实现**
- 原因: 配额需要按周期（hourly/daily/monthly）自动重置
- 方案: checkQuota() 时检查上次重置时间，超过周期自动清零
- 影响: QuotaUsage 接口增加 lastResetAt 字段

### D4: Studio 用 Zustand 管理 Agent 状态
**级别: 实现**
- 原因: Studio 已有 Zustand 基础设施（useChatStore）
- 方案: 新增 agentStore.ts 管理 TenantInfo[] 和 TraceSpan[] 状态
- 影响: 无，与现有 store 并行

## 当前阻塞

无

## 基线锚点

- commit: efa8a7f (proteus-platform master)
- pnpm build: ✅ (core + server + studio + e2e)
- pnpm test: 266 core + 12 E2E passing
- Studio: localhost:5180
- Server: localhost:3000
- API: DeepSeek deepseek-v4-pro via packages/server/.env
