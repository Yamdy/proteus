---
name: platform-migration-strategy
description: 路径 C 迁移策略：提取核心模块 + 新建平台层，6 阶段垂直切片交付
metadata:
  type: project
---

Proteus 做 Agent 平台的迁移策略选定为路径 C。

**决策：** 不在现有代码上改（路径 A），不从零重写（路径 B），而是提取可复用模块 + 新建平台层组装（路径 C）。

**理由：**
- 现有 ~2,000 行高质量代码（HandlerEngine, Context, Schema, OTel, Governance, Evaluation）值得保留
- 需要重写的 ~5,300 行（Harness, Processors, Memory, Server, SDK, Studio）恰好是问题最大的部分
- 新旧项目并存，逐包迁移，每个阶段有可验证的完整通路

**6 个阶段（垂直切片）：**
1. 最小可运行 Agent（P0 通路：SDK → LLM → Checkpoint → OTel）
2. 带工具的 Agent（P0+ 通路：+ 工具调用 + Memory）
3. 服务化（P1 通路：+ HTTP/WS/Studio + SQLite + Resume）
4. 多 Agent 协作（P2 开始：+ AgentRegistry + SubHarness + Agent-as-Tool）
5. 知识共享 + 治理（P2 完整：+ GlobalKnowledge + H1-H4 + MCP）
6. 多租户 + 声明式（平台化：+ TenantContext + Agent Manifest）

**新项目位置：** `c:\Users\90514\code\proteus-platform\`

**Why:** 现有代码的单 Agent 假设深入 Server/SDK/Studio，重构成本 > 重写成本。但核心引擎的事件总线、上下文模型、Schema 体系经过验证，从零重写会重复踩坑。

**How to apply:** 每个阶段从旧项目提取模块到新项目，修复已知问题，写端到端冒烟测试。阶段间通过 handoff 文档传递上下文。[[handoff-protocol]]
