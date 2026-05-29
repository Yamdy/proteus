# Proteus vs ETCLOVG: 逐项对标分析

> 基于论文 "Agent Harness Engineering: A Survey" 的 ETCLOVG 七层分类法
> 对标日期: 2026-05-29

---

## 总览

| ETCLOVG 层 | Proteus 覆盖度 | 状态 |
|------------|---------------|------|
| **E** - Execution & Sandbox | 无 | 未涉及 |
| **T** - Tool Interface & Protocol | 部分 | ToolRegistry 已实现，MCP/协议标准化缺失 |
| **C** - Context & Memory | 部分 | 短期已实现，中/长期缺失 |
| **L** - Lifecycle & Orchestration | 核心已实现 | 单 agent 循环完整，多 agent/全生命周期缺失 |
| **O** - Observability & Operations | 骨架 | OTel stub 存在，未实现 |
| **V** - Verification & Evaluation | 无 | 未涉及 |
| **G** - Governance & Security | 无 | 未涉及（Plugin Isolation Tiers 仅设计） |

---

## E - Execution Environment & Sandbox

### 论文要求

论文定义了 7 类沙箱，核心三重目的：**安全**、**可复现性**、**活跃性**。

| 类别 | 代表系统 | Proteus 对应 |
|------|----------|-------------|
| 通用托管沙箱 | Daytona, E2B, Modal | 无 |
| 计算机使用 Agent 基础设施 | Anthropic Computer Use, CUA | 无 |
| 代码专用沙箱 | Judge0, Code Interpreter | 无 |
| 框架集成运行时 | OpenHands, GoEX | 无 |
| 浏览器评估环境 | WebArena, BrowserGym | 无 |
| OS 级权限沙箱 | sandbox-runtime, Claude Code sandboxing | 无 |
| 沙箱抽象层 | SWE-ReX, SWE-agent | 无 |

### Proteus 现状

- **完全缺失**。Proteus 目前是一个纯框架层，不涉及执行环境隔离。
- Plugin Isolation Tiers（设计中）提到了 Worker Thread 和 isolated-vm，但这属于组件级隔离，不是论文所说的执行沙箱。

### 差距与建议

| 优先级 | 建议 |
|--------|------|
| P2 | 定义 `ExecutionEnvironment` 接口，支持插拔式沙箱后端 |
| P3 | 集成 E2B/Daytona 作为可选沙箱提供商 |
| P3 | 实现 Plugin Isolation Tier 2 (Worker Thread) 和 Tier 3 (isolated-vm) |

---

## T - Tool Interface & Protocol

### 论文要求

论文识别了 4 个集成边界和关键协议标准：

| 集成边界 | 协议 | Proteus 对应 |
|----------|------|-------------|
| Model <-> Function | Function Calling | 已实现（LLM Tool Call） |
| Agent <-> External | MCP | 未实现 |
| Agent <-> Agent | A2A | 未实现 |
| Agent <-> Repo | AGENTS.md | 有 AGENTS.md 文件但未程序化集成 |

设计原则：
- "更少但更好的工具" -- ToolRegistry 已支持
- 自适应发现 -- 未实现
- 工具描述标准化 -- Zod -> JSON Schema 已实现

### Proteus 现状

**已实现：**
- `ToolRegistry` -- 注册/注销/执行/验证，Zod schema 驱动
- `Tool` 接口 -- definition + execute
- `ToolResult` -- output + artifacts + error
- Zod -> JSON Schema 自动推导（zod-to-json-schema）
- 运行时参数验证

**未实现：**
- MCP 协议支持（客户端/服务端）
- A2A 协议支持
- 工具发现与动态注册
- 工具版本管理
- 工具权限控制（与 G 层交叉）

### 差距与建议

| 优先级 | 建议 |
|--------|------|
| P1 | 实现 MCP 客户端 -- 允许 Proteus agent 调用 MCP server |
| P1 | 实现 MCP 服务端 -- 将 Proteus ToolRegistry 暴露为 MCP server |
| P2 | 工具描述标准化 -- 支持从 MCP server 自动导入工具定义 |
| P3 | A2A 协议支持 -- agent 间委派 |

---

## C - Context & Memory Management

### 论文要求

论文定义了三个时间层级：

| 层级 | 时间跨度 | 关键技术 | Proteus 对应 |
|------|----------|----------|-------------|
| 短期 | 活跃上下文窗口 | 渐进式披露、KV-cache 感知、token 预算 | 部分实现 |
| 中期 | 会话状态/跨运行 | 结构化笔记、文件规划、跨运行注入 | 部分实现 |
| 长期 | 跨会话持久化 | MemGPT、Memory Stream、Mem0、A-MEM | 未实现 |

关键设计原则：
- KV-cache 命中率是最重要的指标 -- 未优化
- 渐进式披露 (Progressive Disclosure) -- 未实现
- 上下文压缩 (Compaction) -- 未实现
- 子 agent 上下文隔离 -- 未实现

### Proteus 现状

**已实现（短期）：**
- `WorkingMemory` -- LLMMessage 数组，push/get/truncate/clear
- `ContextAssemblyProcessor` -- 从 WorkingMemory + system prompt + user prompt 组装消息
- Token 预算截断（基础实现）
- `CostTracker` -- token 使用追踪

**已实现（中期）：**
- `CheckpointStore` -- 会话状态持久化（InMemory + SQLite）
- `FrozenContext` -- 深度只读快照，支持检查点/恢复
- `SessionManager` -- 会话生命周期管理

**未实现：**
- 渐进式披露（按需加载文件/工具结果）
- KV-cache 感知的上下文设计
- 上下文压缩（Compaction）-- 摘要+丢弃
- 长期记忆系统（跨会话语义记忆）
- 子 agent 上下文隔离
- 上下文漂移检测与恢复

### 差距与建议

| 优先级 | 建议 |
|--------|------|
| P1 | 实现上下文压缩 -- 当 token 接近上限时自动摘要 |
| P1 | 渐进式披露 -- 工具结果按需加载，不全部注入上下文 |
| P1 | KV-cache 感知设计 -- 保持 system prompt 前缀稳定，追加式上下文 |
| P2 | 中期记忆增强 -- 结构化笔记文件（NOTES.md 模式） |
| P2 | 长期记忆接口 -- 定义 MemoryStore 接口，支持向量/图/KV 后端 |
| P3 | 上下文漂移检测 -- 100+ turn 后的行为一致性监控 |

---

## L - Lifecycle & Orchestration

### 论文要求

论文定义了三个组织层级：

| 层级 | 描述 | Proteus 对应 |
|------|------|-------------|
| 单 Agent 内循环 | ReAct 范式，观察-思考-行动 | 已实现 |
| 多 Agent 编排 | 层级/团队/工作流/扇出/图 | 未实现 |
| 全生命周期管道 | Issue -> 规划 -> 代码 -> 验证 -> PR | 未实现 |

编排模式：
- 层级编排（DeerFlow, AutoGen）
- 团队编排（oh-my-claudecode）
- 图组合（LangGraph）
- 工作流编排（Semantic Kernel）
- 扇出（Emdash）

### Proteus 现状

**已实现（单 Agent 内循环）：**
- `Harness.runTurn()` -- 5 阶段单轮执行
- `Harness.runChain()` -- 多轮循环（maxTurns + AbortSignal）
- `Harness.resume()` / `resumeChain()` -- 从检查点恢复
- `LifecycleStateMachine` -- pending/running/paused/completed/errored/cancelled
- `HandlerEngine` -- 事件驱动的拦截器/观察者模式
- 5 阶段固定管道：context_assembly -> llm_inference -> action_resolution -> tool_execution -> result_observation
- Go 风格返回值控制流（无异常）

**未实现：**
- 多 Agent 编排（子 agent、委派、并行执行）
- 全生命周期管道（任务规划、代码生成、测试、PR）
- 任务分解与调度
- Agent 间通信协议
- 人在回路工作流
- 重试策略与退避

### 差距与建议

| 优先级 | 建议 |
|--------|------|
| P1 | 实现 SubAgent 机制 -- Harness 内部嵌套 Harness |
| P1 | 任务分解工具 -- Plan/Execute 模式 |
| P2 | 多 Agent 编排原语 -- 并行执行、结果聚合 |
| P2 | 全生命周期管道 -- 定义 TaskRunner 接口 |
| P3 | 图组合编排 -- 支持有向无环图工作流 |

---

## O - Observability & Operations

### 论文要求

论文强调可观测性应作为**独立层**（不是生命周期钩子的附属品）：

| 类别 | 代表系统 | Proteus 对应 |
|------|----------|-------------|
| 追踪监控平台 | Langfuse, Opik, Phoenix | 未实现 |
| Agent 特定运维平台 | AgentOps, RagaAI | 未实现 |
| 成本追踪与优化 | TensorZero, Helicone, FrugalGPT | 部分实现 |
| 可靠性工程 | 检查点/恢复、错误分类 | 部分实现 |
| 统一可观测性 | OTel 标准化 | stub 存在 |

关键洞察：
- 89% 团队使用可观测性，仅 52.4% 运行离线评估
- 基础设施噪声可导致 6pp 基准分数变化
- 认知可观测性 -- 追踪 agent "为什么"做某事

### Proteus 现状

**已实现：**
- `CostTracker` -- prompt/completion token 累积追踪
- `CheckpointStore` -- 事件日志（appendEvent/queryEvents）
- SSE 事件广播 -- turn:start/end, phase:before/after, chain:start/end
- `FrozenContext` -- 可序列化的执行快照

**Stub/骨架：**
- `otel-bridge` 内置处理器 -- 存在但未实现
- OTel SDK 已安装为依赖

**未实现：**
- OTel Span/Trace 实际创建与导出
- 追踪可视化（Langfuse/Phoenix 集成）
- 成本归因（per-tool, per-turn, per-task）
- 异常检测
- 可靠性指标（成功率、延迟分位数、重试率）
- 认知可观测性（推理链追踪）

### 差距与建议

| 优先级 | 建议 |
|--------|------|
| P1 | 实现 OTel bridge -- 每个 phase 创建 Span，Chain=Trace, Turn=Span, Phase=Child Span |
| P1 | 成本归因增强 -- per-tool, per-turn 成本明细 |
| P2 | Langfuse/Phoenix 集成 -- 追踪可视化 |
| P2 | 可靠性指标 -- 暴露成功率、延迟、重试率等指标 |
| P3 | 认知可观测性 -- 记录 LLM 推理链和决策过程 |

---

## V - Verification & Evaluation

### 论文要求

论文定义了五阶段任务到反馈生命周期：

| 阶段 | 描述 | Proteus 对应 |
|------|------|-------------|
| 1. 任务与基准接地 | 定义环境、工具、约束、成功标准 | 无 |
| 2. 预执行就绪验证 | 沙箱、依赖、工具、权限检查 | 无 |
| 3. 受控执行与追踪捕获 | 可复现条件下运行 | 部分（CheckpointStore） |
| 4. 多级判断与失败归因 | 结果级/轨迹级/评估器级 | 无 |
| 5. 持续回归与部署反馈 | 转化为回归测试 | 无 |

关键洞察：
- 评估应该是**模型-harness 对**的属性
- 基础设施配置可导致 6pp 基准分数变化
- 追踪原生评估 -- traces 是主要评估数据

### Proteus 现状

- **几乎完全缺失**
- `CheckpointStore` 提供了事件日志，可作为追踪捕获的基础
- `FrozenContext` 可序列化，可作为可复现执行的基础
- 但没有任何评估框架、基准集成、或失败归因机制

### 差距与建议

| 优先级 | 建议 |
|--------|------|
| P2 | 定义 EvaluationHarness 接口 -- 支持基准测试运行 |
| P2 | 追踪原生评估 -- 从 CheckpointStore 事件日志生成评估报告 |
| P2 | 失败归因框架 -- 将失败映射到具体 ETCLOVG 层 |
| P3 | SWE-bench/AgentBench 集成 |
| P3 | 持续回归 -- harness 变更自动触发评估 |

---

## G - Governance & Security

### 论文要求

论文定义了 5 个治理机制：

| 机制 | 描述 | Proteus 对应 |
|------|------|-------------|
| 权限模型与身份管理 | 静态边界、上下文依赖权限 | 无 |
| 生命周期钩子 | 输入/输出护栏、信息流控制 | 部分（HandlerEngine 可支持） |
| 组件加固 | 模型加固、工具加固 | 无 |
| 声明式宪法 | YAML 策略、可编程 DSL | 无 |
| 审计基础设施 | 结构化审计轨迹、异常检测 | 部分（事件日志） |

4 个钩子点：
- H1: 输入验证（LLM 之前）
- H2: 动作验证（工具执行之前）
- H3: 执行后信息流控制
- H4: 人在回路

### Proteus 现状

**可支持但未显式实现：**
- `HandlerEngine` 天然支持 H1-H4 钩子点（register 拦截器在各 phase）
- `HandlerResult` 的 `{ ok: false }` 和 `{ abort }` 可用于策略执行
- `CheckpointStore` 事件日志可用于审计
- Plugin Isolation Tiers 设计（0-3 级隔离）

**未实现：**
- 权限模型（文件/网络/工具访问控制）
- 输入/输出护栏（prompt injection 检测）
- 信息流控制（taint tracking）
- 声明式策略（YAML/DSL）
- 审计日志签名与完整性验证
- 人在回路审批机制

### 差距与建议

| 优先级 | 建议 |
|--------|------|
| P1 | 显式暴露 H1-H4 钩子点 -- 命名化的 before_llm, before_tool, after_tool, before_response |
| P2 | 权限模型 -- 定义 PermissionPolicy 接口 |
| P2 | 审计日志增强 -- 结构化 JSONL，包含 traceId, tool, policy, result |
| P3 | 声明式策略 -- YAML 配置驱动的治理规则 |
| P3 | 人在回路 -- suspend + resume 用于审批工作流 |

---

## 跨层综合对标

### 成本-质量-速度三难困境

| 维度 | Proteus 现状 |
|------|-------------|
| 成本追踪 | 已实现（CostTracker） |
| 质量控制 | 未实现（无评估框架） |
| 速度优化 | 部分（流式输出，但无 KV-cache 优化） |

### 能力-控制权衡

| 维度 | Proteus 现状 |
|------|-------------|
| 能力扩展 | 已实现（ToolRegistry, HandlerEngine） |
| 控制机制 | 未实现（无权限、无护栏） |

### Harness 耦合问题

| 维度 | Proteus 现状 |
|------|-------------|
| 层间解耦 | 良好 -- HandlerEngine 提供事件驱动解耦 |
| 系统级测试 | 缺失 -- 无 harness 级集成测试 |
| 变更影响分析 | 缺失 -- 无跨层影响追踪 |

---

## 优先级排序（按论文对 Proteus 的价值）

### P0 - 核心竞争力（必须做）

| 项目 | 理由 |
|------|------|
| **L: SubAgent 机制** | 论文明确指出多 agent 编排是 2026 年的关键趋势 |
| **C: 上下文压缩** | 论文将上下文漂移列为"最难的开放挑战" |
| **T: MCP 协议支持** | 论文将 MCP 定位为最可见的工具集成基础 |

### P1 - 差异化优势（应该做）

| 项目 | 理由 |
|------|------|
| **O: OTel bridge 实现** | Proteus 已有依赖和 stub，实现成本低 |
| **C: KV-cache 感知设计** | 论文引用 Manus 团队：这是"最重要的指标" |
| **G: 显式钩子点** | HandlerEngine 已支持，只需命名化和文档化 |
| **T: MCP 服务端** | 将 Proteus 暴露为 MCP server，生态价值高 |

### P2 - 生态完善（可以做）

| 项目 | 理由 |
|------|------|
| **V: 评估框架** | 论文强调评估是 harness 工程的核心反馈循环 |
| **C: 长期记忆接口** | 论文详细描述了 MemGPT/Mem0 等系统 |
| **O: 成本归因增强** | 论文的 cost-quality-speed 框架需要细粒度成本数据 |
| **G: 权限模型** | 论文将权限模型列为治理的第一机制 |
| **L: 全生命周期管道** | 论文描述的 Issue -> PR 工作流 |

### P3 - 长期投资（可以晚做）

| 项目 | 理由 |
|------|------|
| **E: 沙箱集成** | Proteus 是框架层，可依赖外部沙箱 |
| **V: 基准集成** | 需要先有评估框架 |
| **G: 声明式策略** | 需要先有权限模型 |
| **L: 图组合编排** | 需要先有 SubAgent |

---

## 结论

Proteus 在 **L（生命周期）** 层有坚实的基础，HandlerEngine + 5 阶段管道 + 检查点/恢复是论文所述的单 agent 内循环的完整实现。但在 **T（工具协议）**、**C（上下文工程）**、**O（可观测性）** 三层有明显的补齐空间，而 **E（执行环境）**、**V（验证评估）**、**G（治理安全）** 三层几乎是空白。

论文的核心洞察是：**harness 的价值在于层间的耦合与协调**。Proteus 的 HandlerEngine 事件驱动架构为这种协调提供了良好的基础，但需要在每个层上都有足够的实现深度，才能验证这个架构是否真的能解决论文提出的"耦合问题"。

建议的演进路径：
```
当前: L(核心) + T(基础) + C(短期) + O(stub)
      |
Phase 1: L(SubAgent) + T(MCP) + C(压缩) + O(OTel) + G(钩子点)
      |
Phase 2: L(管道) + V(评估) + C(长期记忆) + G(权限) + O(成本归因)
      |
Phase 3: E(沙箱) + V(基准) + G(策略) + L(图编排)
```
