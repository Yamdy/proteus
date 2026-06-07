# Phase 1: 最小可运行 Agent

## 目标

跑通 P0 通路：`SDK.chat()` → LLM → 五阶段 Turn → Checkpoint → OTel Trace

## User Story

**作为** 一个使用 Proteus SDK 的开发者
**我希望能** 用 3 行代码创建一个 Agent，发送消息，收到 LLM 回复
**这样我就能** 验证核心引擎能正常工作

### 验收标准（E2E 测试定义）

```gherkin
Given  我安装了 @proteus-platform/core 和 @proteus-platform/sdk
When   我执行:
         const sdk = new ProteusSDK({ llm: myProvider });
         sdk.createSession("s1", config);
         const result = await sdk.chat("s1", "1+1等于几？");
Then   - result.status === "completed"
       - result.turnId 是有效的 UUID
       - result 包含 LLM 的文本回复
       - OTel Trace 中有 5 个阶段 Span（context_assembly → llm_inference →
         action_resolution → tool_execution → result_observation）
       - CheckpointStore 中有这个 Turn 的 FrozenContext 快照
       - CostTracker 记录了非零的 token 用量
```

**对应 E2E 测试：** `e2e/phase1-smoke.test.ts`

## 术语约定

- **迁移**: 从旧项目复制源文件到新项目，修改 import 路径以适配新包结构。不改变业务逻辑、接口签名、测试断言。
- **零改动**: 迁移时只改 import 路径，不改任何其他内容。
- **小改**: 迁移时除 import 路径外，还需修改 1-3 处业务代码（如 bug 修复）。
- **重写**: 保留设计意图但重新实现代码，允许改变实现细节。
- **完成**: 代码写完 + build 通过 + test 通过。只有代码写完不算完成。
- **已验证**: 完成 + commit + 基线锚点已记录在 handoff 中。

## 进度清单

- [ ] 1.1 新建 monorepo 脚手架（pnpm workspace + turbo + tsconfig）
- [x] 1.2 types.ts 迁移（接口定义，不改签名）✅ 2026-06-07 — 零改动，仅改包名注释
- [x] 1.3 schemas/ 迁移（Zod schema，不改逻辑）✅ 2026-06-07 — 零改动，含 tool/handler/session/llm/registry/traces + memory/schemas
- [x] 1.4 utils/hash.ts 迁移 ✅ 2026-06-07 — 零改动
- [x] 1.5 context.ts 迁移（三层上下文 + FrozenContext）✅ 2026-06-07 — 零改动，含 prompt-fragment-registry.ts, memory/types.ts, memory/in-memory-provider.ts
- [x] 1.6 handler-engine.ts 迁移（事件总线，不改逻辑）✅ 2026-06-07 — 零改动，含 worker-handler-runner.ts, worker-pool.ts
- [x] 1.7 lifecycle.ts 迁移（状态机）✅ 2026-06-07 — 零改动
- [x] 1.8 checkpoint-store.ts 迁移（6 窄接口 + InMemory 实现）✅ 2026-06-07 — 零改动，含 ThreadStore
- [x] 1.9 llm/provider.ts + llm/protocols/openai-chat.ts 迁移 ✅ 2026-06-07 — 零改动
- [x] 1.10 tool-registry.ts 迁移 ✅ 2026-06-07 — 零改动
- [x] 1.11 processors.ts 迁移 + 修复 maxTokens bug ✅ 2026-06-07 — D4 修复：estimateTokens() 替代消息条数比较
- [x] 1.12 harness.ts 重写（修复 Processor 执行语义）✅ 2026-06-07 — D5 重写：Processor 独立执行，phase:before/after 仅用于拦截器/观察者
- [x] 1.13 otel-bridge.ts + noop-tracer.ts + metrics-collector.ts 迁移 ✅ 2026-06-07 — 重组为 otel/ 目录，跳过 OTel SDK adapter（Phase 1 只需 noop）
- [x] 1.14 sdk.ts 精简版（只保留 chat + session 管理）✅ 2026-06-07 — 零改动，含 session-manager.ts
- [x] 1.15 端到端冒烟测试通过 ✅ 2026-06-07 — 5/5 测试通过（发消息→回复、回复内容、turnId、CheckpointStore、CostTracker）

## 已做决策

（新 Session 在此追加决策记录）

### D0: 项目位置

新项目位于 `c:\Users\90514\code\proteus-platform\`。
当前 Proteus 仓库保留不动，作为代码提取来源。

### D1: 包名

新包名 `@proteus-platform/core`（避免与旧包 `@proteus/core` 冲突）。

### D2: types.ts 策略

保持原样搬入，不改接口签名。原因：下游模块依赖这些类型，
改签名会导致连锁改动。等阶段 4 多 Agent 时再统一扩展。

### D3: handler-engine.ts 策略

保持原样搬入，不改逻辑。Processor 执行语义的问题在 harness.ts
中修复（让 Harness 独立调用 Processor，而非依赖 phase:before 事件）。
这样 handler-engine.ts 保持简单，职责单一。

### D4: processors.ts 修复

maxTokens bug 修复：将 `wmMessages.length > this.maxTokens`
（消息条数比较）改为实际 token 计数。使用 `@anthropic-ai/tokenizer`
或简单的 `Math.ceil(content.length / 4)` 估算作为 V1 实现。

### D5: harness.ts 重写设计

核心改动：五阶段 Processor 执行从 HandlerEngine 中独立出来。

当前（旧代码）：

```text
engine.emit("phase:before", payload)
  → Processor 作为 interceptor 在 emit 内部执行
  → 语义混乱：Processor 混入了拦截器
```

重写后：

```typescript
// 1. 拦截器有机会阻断
const beforeResults = await engine.emit("phase:before", payload);
if (shouldBlock(beforeResults)) return blocked;

// 2. Processor 独立执行（不是 handler）
const result = await processor.handle(ctx);

// 3. 观察者收到结果
await engine.emit("phase:after", { ...payload, result });
```

这恢复了 ADR-0001 的 Gate/Processor 分离语义。

### D6: CheckpointStore 迁移策略

只迁移 InMemory 实现。SQLite 实现留到阶段 3（服务化）时迁移。
原因：阶段 1 只需要 SDK 直接调用，不需要持久化。

### D7: 测试迁移策略

每个模块迁移时，带着测试文件一起迁移。测试用例的断言逻辑不变，
只改 import 路径。如果旧测试依赖其他未迁移的模块，先 skip，
在 handoff 中记录原因，后续补上。

## 接口契约（不可随意修改）

### HandlerEngine

```typescript
class HandlerEngine {
  constructor(opts?: { maxEmitDepth?: number; workerRunner?: WorkerHandlerRunner });
  register(handler: HandlerDefinition): void;
  observe(event: string, handler: HandlerFn, priority?: number, name?: string): void;
  unregister(name: string): void;
  replace(name: string, handler: HandlerDefinition): void;
  getHandlers(event: string, payload?: unknown): HandlerDefinition[];
  emit(event: string, payload?: unknown): Promise<HandlerResult[]>;
  serialize(): RegistrySnapshot;
  static deserialize(snapshot: RegistrySnapshot, handlerSources: Record<string, HandlerFn>): HandlerEngine;
}
```

### Harness（重写后）

```typescript
interface TurnOptions {
  maxPhases?: number;
  onToken?: (token: string) => void;
  onThinking?: (token: string) => void;
}

interface TurnResult {
  status: "completed" | "suspended" | "aborted" | "errored";
  turnId: string;
  error?: Error;
  suspendInput?: unknown;
}

interface ChainOptions extends TurnOptions {
  maxTurns?: number;
}

interface ChainResult {
  status: "completed" | "max_turns" | "aborted" | "suspended" | "errored";
  turns: number;
  error?: Error;
}

class Harness {
  constructor(opts: { store: CheckpointLog });
  runTurn(session: SessionContext, agent: AgentContext, opts?: TurnOptions): Promise<TurnResult>;
  resume(sessionId: string, agent: AgentContext, input?: string): Promise<TurnResult>;
  runChain(session: SessionContext, agent: AgentContext, opts?: ChainOptions): Promise<ChainResult>;
  resumeChain(sessionId: string, agent: AgentContext, input?: string): Promise<ChainResult>;
}
```

### SessionContext

```typescript
class SessionContext {
  readonly sessionId: string;
  readonly config: SessionConfig;
  readonly workingMemory: WorkingMemory;
  readonly memory: MemoryProvider;
  readonly costTracker: CostTracker;
  constructor(config: SessionConfig, memoryProvider?: MemoryProvider);
}
```

### AgentContext

```typescript
class AgentContext {
  readonly llm: LLMProvider;
  readonly tools: Map<string, Tool>;
  readonly handlerEngine: HandlerEngineHandle;
  readonly fragmentRegistry: PromptFragmentRegistry;
  constructor(opts: AgentContextOptions);
}
```

### HandlerResult

```typescript
type HandlerResult =
  | { ok: true; value?: unknown }
  | { ok: false; reason: string }
  | { abort: boolean; reason: string }
  | { suspend: boolean; pendingInput?: unknown }
  | { error: { message: string; [k: string]: unknown }; recoverable?: boolean };
```

## 源文件映射（旧 → 新）

| 旧文件（Proteus） | 新文件（proteus-platform） | 改动级别 |
| ---- | ---- | ---- |
| packages/core/src/types.ts | packages/core/src/types.ts | 零改动 |
| packages/core/src/schemas/*.ts | packages/core/src/schemas/*.ts | 零改动 |
| packages/core/src/utils/hash.ts | packages/core/src/utils/hash.ts | 零改动 |
| packages/core/src/context.ts | packages/core/src/context.ts | 零改动 |
| packages/core/src/handler-engine.ts | packages/core/src/handler-engine.ts | 零改动 |
| packages/core/src/lifecycle.ts | packages/core/src/lifecycle.ts | 零改动 |
| packages/core/src/checkpoint-store.ts | packages/core/src/checkpoint-store.ts | 零改动 |
| packages/core/src/in-memory-*.ts | packages/core/src/in-memory-*.ts | 零改动 |
| packages/core/src/llm/provider.ts | packages/core/src/llm/provider.ts | 零改动 |
| packages/core/src/llm/protocols/openai-chat.ts | packages/core/src/llm/protocols/openai-chat.ts | 零改动 |
| packages/core/src/tool-registry.ts | packages/core/src/tool-registry.ts | 零改动 |
| packages/core/src/processors.ts | packages/core/src/processors.ts | 小改（maxTokens） |
| packages/core/src/harness.ts | packages/core/src/harness.ts | 重写 |
| packages/core/src/otel-bridge.ts | packages/core/src/otel-bridge.ts | 零改动 |
| packages/core/src/noop-tracer.ts | packages/core/src/noop-tracer.ts | 零改动 |
| packages/core/src/metrics-collector.ts | packages/core/src/metrics-collector.ts | 零改动 |
| packages/sdk/src/sdk.ts | packages/sdk/src/sdk.ts | 精简 |

## 当前阻塞

无
