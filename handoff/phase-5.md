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

**对应 E2E 测试：** `e2e/phase5-smoke.test.ts`

## 术语约定

- **全局知识（Global Knowledge）**: 跨 Agent、跨 Session 共享的知识存储。
- **H1-H4**: Governance 语义钩子。H1=输入验证，H2=动作验证，H3=输出过滤，H4=人工审批。

## 进度清单

- [ ] 5.1 GlobalKnowledgeStore（跨 Session 知识存储）
- [ ] 5.2 KnowledgeAccessPolicy（知识访问控制）
- [ ] 5.3 GovernanceHooks H1-H4 显式映射
- [ ] 5.4 MCP Client 集成到 ToolRegistry
- [ ] 5.5 MCP Server 暴露自身工具
- [ ] 5.6 端到端冒烟测试通过

## 已做决策

（待开发时填写）

## 当前阻塞

无
