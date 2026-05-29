# Agent Harness Engineering: A Survey - 论文总结

> 论文链接: https://openreview.net/pdf/f358711a95aaaf61fdeffd4ef3fc60fba9b8da57.pdf
> 总结日期: 2026-05-29

## 基本信息

- **标题**: Agent Harness Engineering: A Survey
- **作者**: Junjie Li (CMU) 等 18 位研究者，来自 CMU、Yale、JHU、Amazon 等
- **状态**: Under review at TMLR (Transactions on Machine Learning Research)
- **页数**: 71 页

---

## 核心论点 (Binding Constraint Thesis)

对于长时间运行的 LLM agent 任务，**执行 harness（基础设施层）**而非模型本身是限制可靠性的主要约束。三个关键实证：

1. **Boluk (2026a)**: 仅修改工具格式，跨 15 个模型获得最高 **10x** 提升
2. **Trivedy (2026)**: 仅通过基础设施改进，GPT-5.2-Codex 从 52.8% -> 66.5% (**+13.7pp**)
3. **Meta-Harness (2026)**: 自动化 harness 优化达到 **76.4%**，超越所有手工方案

---

## 三大贡献

| 贡献 | 内容 |
|------|------|
| **概念性** | Harness 是约束 agent 可靠性的关键，不是模型 |
| **分类性** | 提出七层 ETCLOVG 分类法 |
| **实证性** | 映射 170+ 开源项目，迄今最大 agent harness 语料库 |

---

## 三个工程阶段演进

| 阶段 | 时间 | 焦点 |
|------|------|------|
| **Prompt Engineering** | 2022-2024 | 优化单一输入文本 |
| **Context Engineering** | 2025 | 管理多步推理中的信息流 |
| **Harness Engineering** | 2026 | 全栈基础设施工程 |

---

## ETCLOVG 七层分类法

| 层 | 含义 | 关键主题 |
|---|---|---|
| **E** | Execution Environment & Sandbox | 7 类沙箱（通用、计算机使用、代码专用、框架集成、浏览器、OS 权限、抽象层）|
| **T** | Tool Interface & Protocol | MCP、A2A、Function Calling、OpenAPI、AGENTS.md |
| **C** | Context & Memory Management | 短期（活跃窗口）、中期（会话状态）、长期（持久记忆）|
| **L** | Lifecycle & Orchestration | 单 agent 循环、多 agent 编排、全生命周期管道 |
| **O** | Observability & Operations | 追踪监控平台、Agent 特定运维、成本优化、可靠性工程 |
| **V** | Verification & Evaluation | 任务基准、预执行验证、执行追踪、多级判断、持续回归 |
| **G** | Governance & Security | 权限模型、生命周期钩子、组件加固、声明式宪法、审计基础设施 |

---

## 各层核心要点

### E - 执行环境与沙箱

- 沙箱的三重目的：**安全**、**可复现性**、**活跃性**
- SandboxEscapeBench: 前沿模型 15-35% 逃逸成功率
- Anthropic: 沙箱化减少 84% 权限提示

**7 类沙箱**:
1. 通用托管沙箱 (Daytona, E2B, Modal)
2. 计算机使用 Agent 基础设施 (Anthropic Computer Use, CUA)
3. 代码专用沙箱 (Judge0, Code Interpreter)
4. 框架集成运行时 (OpenHands, GoEX)
5. 浏览器评估环境 (WebArena, BrowserGym)
6. OS 级权限沙箱 (sandbox-runtime, Claude Code sandboxing)
7. 沙箱抽象层 (SWE-ReX, SWE-agent)

### T - 工具接口与协议

- MCP 成为最可见的工具集成基础
- A2A 用于 agent 间通信
- 4 个集成边界：Model<->Function、Agent<->External、Agent<->Agent、Agent<->Repo
- 设计原则："更少但更好的工具"

**协议标准**:
| 协议 | 边界 | 用途 |
|------|------|------|
| Function Calling | Model<->Function | 结构化调用 |
| MCP | Agent<->External | 运行时工具解耦 |
| A2A | Agent<->Agent | 跨进程委派 |
| AGENTS.md | Agent<->Repo | 版本控制策略 |

### C - 上下文与记忆管理

- **KV-cache 命中率**是"生产级 AI agent 最重要的指标"
- 缓存 token: $0.30/MTok vs 未缓存: $3.00/MTok
- MemGPT: 将上下文窗口视为 RAM，外部存储视为磁盘
- **上下文漂移**(Context Drift): 最难的开放挑战

**三个记忆层级**:
| 层级 | 时间跨度 | 技术 |
|------|----------|------|
| 短期 | 活跃上下文窗口 | 渐进式披露、KV-cache 感知设计 |
| 中期 | 会话状态/跨运行 | 结构化笔记、文件规划、跨运行注入 |
| 长期 | 跨会话持久化 | MemGPT、Memory Stream、Mem0、A-MEM |

**关键设计原则**:
- 渐进式披露 (Progressive Disclosure)
- KV-cache 感知的上下文设计
- 上下文压缩 (Compaction)
- 子 agent 上下文隔离

### L - 生命周期与编排

- 从单 agent 循环 -> 多 agent 编排 -> 全生命周期管道
- OpenCode (155.8k stars)、Claude Code (120.9k)、Gemini CLI (103.3k)
- 混合设计：可重放历史 + 持久化制品

**三个组织层级**:
1. **单 Agent 内循环**: ReAct 范式，观察-思考-行动
2. **多 Agent 编排**: 层级编排、团队编排、工作流编排、扇出、图组合
3. **全生命周期管道**: Issue -> 规划 -> 代码生成 -> 验证 -> PR

**编排模式**:
| 模式 | 代表系统 |
|------|----------|
| 层级编排 | DeerFlow, AutoGen, OpenAI Agents SDK |
| 团队编排 | oh-my-claudecode |
| 图组合 | LangGraph, Hive |
| 工作流编排 | Semantic Kernel |
| 扇出 | Emdash |

### O - 可观测性与运维

- Langfuse、Opik、Arize Phoenix 等追踪平台
- OpenTelemetry 成为事实标准
- **认知可观测性**: 不仅追踪 agent 做了什么，还追踪为什么
- 89% 团队使用可观测性，仅 52.4% 运行离线评估

**关键洞察**:
- 可观测性应独立于生命周期钩子
- AgentSight: 使用 eBPF 从进程外部监控，<3% CPU 开销
- Watson: 部署"代理 agent"重现主 agent 的推理
- **基础设施噪声**: 仅基础设施配置就能导致 6pp 基准分数变化

**成本优化**:
- FrugalGPT: 自适应级联可匹配 GPT-4 性能，减少 98% 成本
- GPTCache: 语义缓存层
- Dual-Pool Routing: 减少 31-42% GPU 小时

### V - 验证与评估

- 五阶段生命周期：任务接地 -> 预执行验证 -> 受控执行 -> 多级判断 -> 持续回归
- 评估应该是**模型-harness 对**的属性，不是单独模型的属性
- 基础设施配置可导致 6 个百分点的基准分数变化

**五阶段生命周期**:
1. **任务与基准接地**: 定义环境、工具、约束、成功标准
2. **预执行就绪验证**: 沙箱、依赖、工具、上下文、权限、预算、评判器
3. **受控执行与追踪捕获**: 可复现条件下运行 agent
4. **多级判断与失败归因**: 结果级、轨迹级、评估器级
5. **持续回归与部署反馈**: 转化为回归测试和 harness 改进

**关键基准**:
| 基准 | 领域 |
|------|------|
| SWE-bench | 软件工程 |
| Terminal-Bench | 命令行工作流 |
| WebArena | 浏览器任务 |
| OSWorld | 桌面环境 |
| GAIA | 通用助手 |

### G - 治理与安全

- 4 个钩子点：输入验证、动作验证、执行后 IFC、人在回路
- MCP 安全问题：工具描述投毒、供应链攻击
- **slopsquatting**: 21.7% 开源模型幻觉出不存在的包名

**治理机制**:
1. **权限模型与身份管理**: 静态边界、上下文依赖权限、身份管理
2. **生命周期钩子**: 输入护栏、输出护栏、信息流控制、人在回路
3. **组件加固**: 模型加固、分类器加固、工具加固、协议加固
4. **声明式宪法**: 训练时宪法、部署时 YAML、可编程策略语言
5. **审计基础设施**: 结构化审计轨迹、异常检测、成本资源审计

**安全威胁分类 (Kim et al. 2026)**:
- 51 种攻击方法
- 60 种防御方法
- 7 个设计维度：输入信任、访问敏感性、工作流、动作、记忆、工具、用户界面

---

## 跨层综合

| 关键问题 | 内容 |
|----------|------|
| **成本-质量-速度三难困境** | 更强的沙箱/评估/治理增加成本和延迟 |
| **能力-控制权衡** | 更多权限 -> 更大攻击面 |
| **Harness 耦合问题** | 层间耦合使局部优化脆弱 |
| **从框架到平台** | 生态从 agent 框架向 agent 平台演进 |

---

## 5 个开放问题

1. **强化和扩展执行环境**: 安全性、可扩展性、可移植性
2. **在长时间运行 agent 中维护可靠状态**: 将上下文管理重构为状态估计
3. **从 agent 追踪诊断失败**: 追踪原生评估
4. **跨 agent/工具/人的标准交接**: 定义丰富的交接协议
5. **随模型改进保持 harness 有用**: 自适应简化

---

## 生态系统映射

171 个公开条目，按 ETCLOVG 层分类：

| 层 | 条目数 | 代表性项目 |
|----|--------|------------|
| E (执行) | 20 | Daytona, E2B, CUA, OpenSandbox |
| T (工具) | 12 | GitHub Spec Kit, MCP Servers, AGENTS.md |
| C (上下文) | 9 | claude-mem, planning-with-files, Trellis |
| L (生命周期) | 47 | OpenCode, Claude Code, Gemini CLI, LangGraph |
| O (可观测性) | 15 | Langfuse, MLflow, Opik, TensorZero |
| V (验证) | 21 | Promptfoo, DeepEval, SWE-bench |
| G (治理) | 14 | LiteLLM, Kong, IronClaw, Portkey Gateway |

---

## 参考 Harness 实现

| 实现 | 模式 | ETCLOVG 层 |
|------|------|------------|
| Claude Code | 终端编码 agent，单 agent 编辑/调试/Git 循环 | E, T, C, L, G |
| OpenCode | 开源终端编码 agent，plan/build 角色，子 agent | E, T, L |
| Codex CLI | 终端原生，无状态重放 | E, T, L, V |
| OpenHands | 开放软件工程 agent 平台 | E, T, C, L, V |
| SWE-agent | Issue 修复编码 agent，agent-computer 接口 | E, T, L, V |
| Symphony | Codex 编排规范，任务运行器工作流 | C, L, V, G |

---

## 对 Proteus 项目的启示

1. **Harness 是核心**: 不要过度关注模型能力，基础设施质量决定了实际可靠性
2. **ETCLOVG 分类法**: 可作为 Proteus 架构设计的参考框架
3. **上下文工程至关重要**: KV-cache 命中率、渐进式披露、上下文压缩是关键
4. **可观测性应独立**: 不应作为生命周期钩子的附属品
5. **治理是第一类公民**: 权限、审计、安全需要独立的架构层
6. **评估是模型-harness 对的属性**: 不能单独评估模型
7. **自适应简化**: 随模型改进，harness 应该变简单，而不是更复杂
