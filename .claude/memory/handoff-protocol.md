---
name: handoff-protocol
description: 4 层上下文系统（L0-L3）确保 AI Session 间无损交接
metadata:
  type: project
---

大规模迁移需要多个 AI Session 协作，每个 Session 的上下文窗口装不下全部信息。设计了 4 层上下文系统解决 handoff 问题。

**L0: 项目常驻（每次自动加载）**
- `CLAUDE.md` — 项目约定、编码规范、禁止事项、工作流程
- `docs/architecture.md` — 完整架构蓝图
- `docs/adr/` — 架构决策记录

**L1: 阶段常驻（阶段内多个 Session 共享）**
- `handoff/phase-N.md` — 目标、进度清单、设计决策、接口契约、源文件映射、阻塞

**L2: Session 级（单次会话工作日志）**
- `handoff/session-log/YYYY-MM-DD-HH.md` — 做了什么、改了什么、遇到什么、下一步

**L3: 验证层（每次 Session 开始自动检查）**
- `handoff/verification/phase-N-checklist.md` — 必须项/应该项/可选项
- `e2e/phaseN-smoke.test.ts` — 端到端冒烟测试

**Session 启动协议：** 读 CLAUDE.md → 读 phase-N.md → 读最新 session-log → pnpm build → pnpm test → 从第一个未完成项开始

**Session 结束协议：** pnpm build + test → 更新 phase-N.md → 写 session-log → git commit

**关键规则：**
- 不在 phase handoff 中记录的决策 = 不存在
- 接口签名是契约，修改必须在 handoff 中记录
- 验证先于推进，不通过的阶段不能进入下一阶段

**Why:** 单次 Session 装不下 20+ 模块、100+ 决策、120+ 测试文件的全部上下文。没有结构化 handoff，下一个 Session 会重复踩坑或破坏已有设计。

**How to apply:** 每次新 Session 的第一条指令读 handoff 文档，最后一条指令更新 handoff 文档。[[platform-migration-strategy]]
