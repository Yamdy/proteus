# PRD: ETCLOVG 全栈 Agent Harness 基础设施

## Problem Statement

Proteus 作为 event-driven agent loop 框架，在 L（生命周期）层有坚实的基础（HandlerEngine + 5 阶段管道 + 检查点/恢复），但对标 Agent Harness Engineering 论文的 ETCLOVG 七层分类法，存在明显的结构性缺口：

- **T 层**：ToolRegistry 已实现但不支持 MCP 协议，无法接入生态工具
- **C 层**：短期上下文已实现但缺乏压缩、渐进式披露和长期记忆
- **O 层**：OTel 依赖已安装但 bridge 是 stub，无法产生可观测数据
- **G 层**：HandlerEngine 天然支持钩子点但未命名化，无权限/护栏/审计
- **E 层**：无执行环境抽象，无法隔离工具执行
- **V 层**：无评估框架，无法衡量 harness 质量

这导致 Proteus 只是一个"agent 循环引擎"，而非完整的 agent harness。用户需要自己补齐所有基础设施层，降低了框架的实际价值。

## Solution

为 Proteus 实现 ETCLOVG 全栈 harness 基础设施，使其成为完整的 agent harness 框架。七层按实现深度分为三档：

- **深实现**（独立包，完整功能）：L、T、C、O
- **接口+可插拔**（核心包内接口，第三方实现）：E、V、G
- 所有层共享 HandlerEngine 事件驱动架构，通过事件总线协调

## User Stories

1. As a framework user, I want to connect my agent to any MCP server, so that I can reuse the growing MCP tool ecosystem without custom integration code
2. As a framework user, I want to expose my ToolRegistry as an MCP server, so that other agents and tools can discover and invoke my tools
3. As a framework user, I want my agent's context to be automatically compressed when approaching token limits, so that long-running tasks don't fail due to context overflow
4. As a framework user, I want progressive disclosure of tool results, so that my agent loads detailed information only when needed, reducing token costs
5. As a framework user, I want KV-cache-aware context assembly, so that cached tokens cost 10x less than uncached tokens
6. As a framework user, I want my agent to persist and recall memories across sessions, so that it can build up knowledge over time
7. As a framework user, I want to spawn sub-agents from within a turn, so that complex tasks can be decomposed and delegated
8. As a framework user, I want sub-agents to have isolated context windows, so that exploration noise doesn't pollute the orchestrator's view
9. As a framework user, I want OpenTelemetry traces automatically generated from agent execution, so that I can monitor, debug, and optimize my agent in production
10. As a framework user, I want per-tool and per-turn cost attribution, so that I can identify which tools and phases consume the most resources
11. As a framework user, I want named governance hook points (before_llm, before_tool, after_tool, before_response), so that I can inject security policies at each stage
12. As a framework user, I want to define permission policies declaratively, so that access control is auditable and version-controlled
13. As a framework user, I want structured audit logs with trace IDs, tool names, policy decisions, and results, so that I can investigate agent behavior post-hoc
14. As a framework user, I want pluggable execution environment backends, so that I can run tool execution in sandboxes of varying isolation levels
15. As a framework user, I want an evaluation harness interface, so that I can run benchmarks and track harness quality over time
16. As a framework user, I want failure attribution that maps errors to specific ETCLOVG layers, so that I know whether a failure is a tool issue, context issue, or governance issue
17. As a framework developer, I want each ETCLOVG layer to be independently testable, so that I can verify layer behavior without standing up the full system
18. As a framework developer, I want the MCP client to handle connection lifecycle (connect, reconnect, timeout) automatically, so that tool calls are resilient to server failures
19. As a framework developer, I want the ContextCompactor to be configurable (what to keep, what to summarize, what to discard), so that different use cases can tune compression behavior
20. As a framework user, I want the OTel bridge to map Chains to Traces, Turns to Spans, and Phases to Child Spans, so that the trace hierarchy matches the execution model
21. As a framework user, I want input guardrails that detect prompt injection before the LLM sees it, so that my agent can defend against adversarial inputs
22. As a framework user, I want output guardrails that validate tool calls before execution, so that the agent cannot invoke unauthorized or dangerous operations
23. As a framework user, I want a human-in-the-loop hook that suspends execution and waits for approval, so that destructive actions require explicit consent
24. As a framework user, I want to query the event log with time range and event type filters, so that I can analyze agent behavior patterns
25. As a framework user, I want the evaluation harness to replay frozen contexts, so that I can reproduce and debug failed runs deterministically

## Implementation Decisions

### Module 1: @proteus/mcp — MCP 协议层（T 层深实现）

**子模块：**
- `McpClient` — 连接 MCP server，发现工具，转发调用
- `McpServer` — 将 ToolRegistry 暴露为 MCP server
- `McpToolAdapter` — 将 MCP tool 定义转换为 Proteus ToolDefinition，将 MCP 调用结果转换为 ToolResult

**关键接口：**
- `McpClient.connect(serverUrl)` / `disconnect()` / `listTools()` / `callTool(name, params)`
- `McpServer.registerTool(tool)` / `start(port)` / `stop()`
- `McpToolAdapter.fromMcpTool(mcpToolDef) → Tool` / `toMcpTool(tool) → McpToolDef`

**设计决策：**
- MCP 客户端使用 JSON-RPC over stdio（本地）和 SSE（远程）两种传输
- MCP 服务端默认暴露在 `--mcp-port` 配置端口
- 工具发现是 lazy 的：connect 时不拉取，首次 listTools 时缓存
- 连接失败时自动重试（指数退避，最多 3 次）
- McpToolAdapter 处理 Zod <-> JSON Schema 双向转换

**包结构：**
```
packages/mcp/
  src/
    client.ts          -- McpClient
    server.ts          -- McpServer
    adapter.ts         -- McpToolAdapter
    transport/
      stdio.ts         -- stdio 传输
      sse.ts           -- SSE 传输
    types.ts           -- MCP 协议类型定义
    index.ts           -- 公共 API
    *.test.ts          -- 测试
```

### Module 2: @proteus/memory — 上下文与记忆层（C 层深实现）

**子模块：**
- `ContextCompactor` — 上下文压缩引擎
- `MemoryStore` — 长期记忆接口
- `VectorMemoryStore` — 向量数据库后端
- `KvMemoryStore` — KV 存储后端
- `ProgressiveDisclosure` — 渐进式披露管理器

**关键接口：**
- `ContextCompactor.compact(messages, budget) → { compacted, summary, dropped }`
- `ContextCompactor.configure({ keepSystemPrompt, keepRecentTurns, summarizeStrategy, discardThreshold })`
- `MemoryStore.write(entry)` / `read(query, limit)` / `forget(query)` / `consolidate()`
- `MemoryEntry { id, content, embedding?, metadata, timestamp, accessCount, importance }`
- `ProgressiveDisclosure.register(identifier, loader)` / `resolve(identifier) → content`

**设计决策：**
- ContextCompactor 默认策略：保留 system prompt（不可丢弃）、保留最近 N 轮、中间轮次摘要化、工具结果替换为路径引用
- 摘要化使用 LLM 调用（通过现有 LLMProvider），可配置为轻量级截断模式
- MemoryStore 接口支持三种后端：InMemory（默认/测试）、SQLite（CheckpointStore 复用）、向量数据库（可选）
- ProgressiveDisclosure 维护一个 identifier → loader 映射，上下文组装时只注入 identifier，工具执行时按需加载
- KV-cache 感知：ContextAssemblyProcessor 保证 system prompt 前缀稳定，追加式构建消息列表

**包结构：**
```
packages/memory/
  src/
    compactor.ts           -- ContextCompactor
    memory-store.ts        -- MemoryStore 接口
    vector-store.ts        -- VectorMemoryStore
    kv-store.ts            -- KvMemoryStore
    progressive-disclosure.ts -- ProgressiveDisclosure
    types.ts               -- 类型定义
    index.ts               -- 公共 API
    *.test.ts              -- 测试
```

### Module 3: SubHarness — 子 Agent 机制（L 层核心扩展）

**修改文件：** `packages/core/src/sub-harness.ts`（新增）

**关键接口：**
- `SubHarness.create(parentContext, options) → { harness, session, isolation }`
- `SubHarness.run(task, options) → { result, summary, tokenUsage }`
- `SubHarness.isolation` — `'full'` (全新上下文) | `'shared'` (继承父上下文) | `'summary'` (注入父上下文摘要)

**设计决策：**
- SubHarness 是 Harness 的轻量包装，共享 HandlerEngine 但拥有独立的 SessionContext
- 三种隔离模式：
  - `full`：全新上下文窗口，子 agent 只收到任务描述（默认）
  - `shared`：继承父 agent 的 WorkingMemory（昂贵，仅用于需要共享状态的场景）
  - `summary`：父 agent 上下文的压缩摘要注入子 agent
- 子 agent 结果返回给父 agent 时，自动截断为 `maxSummaryTokens`（默认 2000）
- 子 agent 支持 AbortSignal 继承：父 agent 取消时，所有子 agent 同时取消
- 子 agent 的成本归入父 agent 的 CostTracker

### Module 4: GovernanceHooks — 治理钩子（G 层接口实现）

**修改文件：** `packages/core/src/governance.ts`（新增）

**关键接口：**
- `GovernanceHooks.registerBeforeLlm(handler)` — H1: 输入验证
- `GovernanceHooks.registerBeforeTool(handler)` — H2: 动作验证
- `GovernanceHooks.registerAfterTool(handler)` — H3: 执行后信息流控制
- `GovernanceHooks.registerBeforeResponse(handler)` — H4: 人在回路
- `PermissionPolicy.canExecute(toolName, params, context) → { allowed, reason? }`

**设计决策：**
- GovernanceHooks 是 HandlerEngine 的薄包装，将 phase:before/after 事件映射为语义化的 H1-H4
- H1 注册为 `context_assembly` 的 phase:before 拦截器
- H2 注册为 `tool_execution` 的 phase:before 拦截器
- H3 注册为 `tool_execution` 的 phase:after 拦截器
- H4 注册为 `result_observation` 的 phase:before 拦截器，返回 `{ suspend }` 触发人在回路
- PermissionPolicy 接口允许声明式权限检查，内置 `AllowAllPolicy`（默认）和 `DenyListPolicy`
- 审计日志通过 CheckpointStore 的 event log 实现，新增 `governance:decision` 事件类型

### Module 5: OtelBridge — 可观测性桥接（O 层实现）

**修改文件：** `packages/core/src/otel-bridge.ts`（修改现有 stub）

**关键映射：**
```
Chain   → OTel Trace
Turn    → OTel Span (child of Chain Trace)
Phase   → OTel Span (child of Turn Span)
Handler → OTel Span (child of Phase Span)
```

**Span 属性：**
- Chain: `chain.id`, `chain.max_turns`, `chain.status`
- Turn: `turn.id`, `turn.status`, `turn.token_usage.prompt`, `turn.token_usage.completion`, `turn.cost`
- Phase: `phase.name`, `phase.status`, `phase.duration_ms`
- Handler: `handler.name`, `handler.priority`, `handler.result_type`

**设计决策：**
- OtelBridge 替换现有 stub，实现为真正的 HandlerEngine observer
- 使用 `@opentelemetry/api` 的 `trace.getTracer('proteus')` 获取 tracer
- 每个 phase:before 创建 Span，phase:after 结束 Span
- 异常事件通过 Span.recordException() 记录
- 成本指标通过 OTel Metrics API 暴露（`proteus.tokens.prompt`, `proteus.tokens.completion`, `proteus.cost`）
- 支持通过环境变量 `OTEL_EXPORTER_OTLP_ENDPOINT` 配置导出目标
- 无 OTel collector 时自动降级为 no-op（不产生开销）

### Module 6: ExecutionEnvironment — 执行环境抽象（E 层接口）

**修改文件：** `packages/core/src/execution-env.ts`（新增）

**关键接口：**
- `ExecutionEnvironment.execute(command, options) → { stdout, stderr, exitCode }`
- `ExecutionEnvironment.readFile(path) → content`
- `ExecutionEnvironment.writeFile(path, content)`
- `ExecutionEnvironment.createSandbox(options) → SandboxHandle`
- `SandboxHandle.execute(command)` / `destroy()`

**设计决策：**
- 接口设计参考 SWE-ReX 的抽象层思想
- 内置 `LocalExecutionEnvironment`（直接 child_process，默认）
- `SandboxExecutionEnvironment` 为可插拔接口，不内置实现
- 工具执行时通过 `ToolExecutionProcessor` 注入 ExecutionEnvironment
- 默认使用 LocalExecutionEnvironment，用户可替换为沙箱后端

### Module 7: EvaluationHarness — 评估框架（V 层接口）

**修改文件：** `packages/core/src/evaluation.ts`（新增）

**关键接口：**
- `EvaluationHarness.runSuite(suite) → EvalReport`
- `EvalSuite { name, tasks: EvalTask[], graders: EvalGrader[] }`
- `EvalTask { id, input, expectedOutput?, environment? }`
- `EvalGrader.judge(task, actualOutput, trace) → { pass, score, attribution }`
- `EvalReport { suite, results, summary, failureAttribution }`

**设计决策：**
- 评估框架是 Harness 的上层包装：它创建 Harness 实例，运行任务，收集 traces，评判结果
- 失败归因通过 trace 分析实现：检查每个 phase 的 HandlerResult，映射到 ETCLOVG 层
- `FrozenContext` 可序列化支持可复现执行：评估时可以冻结+恢复上下文
- 内置 `ExactMatchGrader` 和 `LLMJudgeGrader`，用户可自定义
- 评估结果持久化到 CheckpointStore，支持跨次比较

### 跨模块集成

```
Harness.runTurn()
  ├── GovernanceHooks.beforeLlm (H1)     ← G 层
  ├── ContextAssemblyProcessor
  │     ├── ContextCompactor.compact()    ← C 层
  │     ├── ProgressiveDisclosure         ← C 层
  │     └── KV-cache-aware ordering       ← C 层
  ├── GovernanceHooks.beforeTool (H2)     ← G 层
  ├── ToolExecutionProcessor
  │     ├── McpClient.callTool()          ← T 层
  │     └── ExecutionEnvironment          ← E 层
  ├── GovernanceHooks.afterTool (H3)      ← G 层
  ├── SubHarness.run()                    ← L 层
  ├── GovernanceHooks.beforeResponse (H4) ← G 层
  ├── OtelBridge (全程 Span 追踪)         ← O 层
  └── MemoryStore.write()                 ← C 层
```

## Testing Decisions

**测试原则：**
- 每个模块独立可测试，不依赖其他模块的运行时状态
- 测试外部行为（接口契约），不测试内部实现
- 使用 InMemoryCheckpointStore 和 mock LLMProvider 作为测试基础设施
- 集成测试验证跨模块协作

**模块测试计划：**

| 模块 | 测试类型 | 优先级 | 参考 |
|------|----------|--------|------|
| McpClient | 单元 + 集成 | P0 | `tool-registry.test.ts`（注册/调用模式） |
| McpServer | 单元 + 集成 | P0 | `chat-server.test.ts`（HTTP 服务模式） |
| McpToolAdapter | 单元 | P0 | `tool-registry.test.ts`（schema 转换） |
| ContextCompactor | 单元 | P0 | `processors.test.ts`（消息处理） |
| MemoryStore | 单元 | P1 | `checkpoint-store.test.ts`（持久化模式） |
| ProgressiveDisclosure | 单元 | P1 | `processors.test.ts`（上下文组装） |
| SubHarness | 集成 | P0 | `harness.test.ts`（runChain 模式） |
| GovernanceHooks | 单元 | P1 | `handler-engine.test.ts`（拦截器模式） |
| OtelBridge | 单元 | P1 | 新模式：验证 Span 创建和属性 |
| ExecutionEnvironment | 单元 | P2 | 新模式：验证命令执行 |
| EvaluationHarness | 集成 | P2 | 新模式：验证评估生命周期 |

**集成测试：**
- MCP 客户端 + 服务端双向通信
- SubHarness + ContextCompactor 协作（子 agent 上下文隔离 + 压缩）
- GovernanceHooks + OtelBridge 协作（治理决策产生审计 trace）
- 全链路：MCP 工具调用 → 治理检查 → 执行 → OTel 追踪 → 成本归因

## Out of Scope

1. **具体沙箱实现**：不内置 E2B/Daytona 集成，只提供接口
2. **具体向量数据库集成**：不内置 Pinecone/Chroma，只提供 MemoryStore 接口
3. **A2A 协议**：agent 间通信协议，本 PRD 不覆盖
4. **Studio UI 更新**：Studio 包的 UI 变更不在本 PRD 范围内
5. **Server 包实现**：Fastify 服务端的实现不在本 PRD 范围内
6. **SDK 包实现**：SDK 包的封装不在本 PRD 范围内
7. **具体基准测试集成**：不内置 SWE-bench/AgentBench，只提供评估接口
8. **训练时治理**：不涉及 RLHF/Constitutional AI，只覆盖部署时治理

## Further Notes

### 与 Proteus 现有架构的兼容性

- 所有新模块通过 HandlerEngine 事件总线集成，不修改现有 5 阶段管道
- GovernanceHooks 是 HandlerEngine 的薄包装，不引入新的抽象层
- McpClient/McpServer 是独立包，core 包通过可选依赖引用
- MemoryStore 是独立包，core 包通过可选依赖引用
- SubHarness 是 core 包内的新模块，复用现有 Harness 基础设施

### 实现顺序建议

```
Phase 1 (P0): MCP 客户端/服务端 + 上下文压缩 + SubHarness
Phase 2 (P1): OTel bridge + 治理钩子 + 长期记忆 + KV-cache 感知
Phase 3 (P2): 执行环境接口 + 评估框架 + 成本归因增强
```

### 对论文开放问题的回应

论文提出的 5 个开放问题，本 PRD 回应了其中 3 个：
1. **维护可靠状态** → ContextCompactor + MemoryStore
2. **从追踪诊断失败** → OtelBridge + EvaluationHarness 失败归因
3. **保持 harness 有用** → 模块化设计，每个层可独立升级/替换
