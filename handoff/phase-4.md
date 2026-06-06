# Phase 4: 多 Agent 协作

## 目标

跑通 P2 通路（开始）：多 Agent 委托执行 + 跨 Agent OTel Trace

## User Story

**作为** 一个使用 Proteus 平台的开发者
**我希望能** 定义多个 Agent，让一个 Agent 能委托任务给另一个
**这样我就能** 验证多 Agent 协作可用

### 验收标准

```gherkin
Given  我定义了 coder Agent 和 reviewer Agent
When   我对 coder 说 "写一个函数，然后让 reviewer 审查"
Then   - coder 生成代码
       - coder 调用 delegate_to_reviewer 工具
       - reviewer 收到代码，执行审查，返回结果
       - coder 根据审查结果可能修改代码
       - OTel Trace 树包含两个 Agent 的 Span（parent-child）
       - 成本正确归因到父 Agent
```

**对应 E2E 测试：** `e2e/phase4-smoke.test.ts`

## 术语约定

- **委托（Delegation）**: Agent A 把任务交给 Agent B，等待 B 返回结果后继续。
- **Agent-as-Tool**: 把一个 Agent 包装为 Tool，其他 Agent 可以像调用工具一样调用它。

## 进度清单

- [ ] 4.1 AgentRegistry（Agent 元数据注册）
- [ ] 4.2 AgentRouter（跨 Agent 事件路由）
- [ ] 4.3 SubHarness 重写（三种隔离模式：full / shared / summary）
- [ ] 4.4 Agent-as-Tool（Agent 包装为 Tool）
- [ ] 4.5 OTel Trace 树扩展（跨 Agent parent-child Span）
- [ ] 4.6 成本归因到父 Agent
- [ ] 4.7 端到端冒烟测试通过

## 已做决策

（待开发时填写）

## 当前阻塞

无
