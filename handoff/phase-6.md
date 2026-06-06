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

- [ ] 6.1 TenantContext + QuotaManager
- [ ] 6.2 Agent Manifest Schema（Zod）
- [ ] 6.3 Manifest → Runtime 编译器
- [ ] 6.4 Server 多租户路由 + 配额检查
- [ ] 6.5 Studio 多 Agent 可视化（Trace 树 + 状态面板）
- [ ] 6.6 端到端冒烟测试通过

## 已做决策

（待开发时填写）

## 当前阻塞

无
