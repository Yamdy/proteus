# @proteus/core 模块分析

## 模块概述

`@proteus/core` 是 Proteus 框架的核心运行时模块，提供 Agent Loop、HandlerEngine、Harness、CheckpointStore 等核心功能。这是一个独立的库，不包含 IO 或传输层关注点。

## 架构设计

### 核心架构模式

1. **事件驱动架构** - 基于 HandlerEngine 的事件总线模式
2. **三层上下文模型** - AgentContext → SessionContext → TurnContext
3. **五阶段执行模型** - context_assembly → llm_inference → action_resolution → tool_execution → result_observation
4. **状态机模式** - LifecycleStateMachine 管理生命周期

### 依赖关系

```json
{
  "dependencies": {
    "@opentelemetry/api": "^1.9.0",
    "@opentelemetry/auto-instrumentations-node": "^0.54.0",
    "@opentelemetry/exporter-logs-otlp-http": "^0.57.0",
    "@opentelemetry/exporter-metrics-otlp-http": "^0.57.0",
    "@opentelemetry/exporter-trace-otlp-http": "^0.57.0",
    "@opentelemetry/sdk-node": "^0.57.0",
    "ai": "^4.1.0",
    "better-sqlite3": "^11.0.0",
    "zod": "^3.25.0",
    "zod-to-json-schema": "^3.25.0"
  }
}
```

## 核心特性

### 1. HandlerEngine（事件总线）

**文件**: `handler-engine.ts`

HandlerEngine 是合并了 EventBus 和 HandlerRegistry 的单一类，提供所有处理器注册、事件发射和流控制功能。

#### 核心接口

```typescript
interface HandlerDefinition {
  name: string;                    // 唯一标识符
  phases?: PhaseName[];            // 限定到特定阶段
  events?: string[];               // 限定到特定事件
  priority?: number;               // 优先级（越低越早执行，默认100）
  trust: 0 | 1 | 2 | 3;           // 隔离层级
  builtin?: boolean;               // 是否为内置处理器（受保护）
  handle: HandlerFn;               // 处理器函数
}

type HandlerFn = (ctx: HandlerContext) => Promise<HandlerResult>;
```

#### 处理器类型

- **Interceptors（拦截器）** - 通过 `engine.register(handler)` 注册，可短路后续处理器
- **Observers（观察者）** - 通过 `engine.observe(event, fn, priority, name)` 注册，始终执行

#### HandlerResult 返回值

```typescript
type HandlerResult = 
  | { ok: true }                          // 继续执行
  | { ok: true, value: any, transform: true }  // 转换数据
  | { ok: false, reason: string }         // 阻止/拒绝
  | { abort: boolean, reason: string, retryFrom?: string }  // 终止
  | { suspend: boolean, pendingInput?: unknown }  // 暂停（等待外部输入）
  | { error: { message: string }, recoverable?: boolean };  // 错误
```

#### 内置处理器

| 名称 | 事件 | 优先级 | 用途 |
|------|------|--------|------|
| checkpoint | turn:end | 10 | 检查点保存 |
| cost-tracker | llm:response | 20 | 成本追踪 |
| otel-bridge | phase:before/after | 30 | OTel 桥接 |
| freeze-guard | phase:before | 5 | 冻结保护 |

### 2. Harness（编排器）

**文件**: `harness.ts`

Harness 编排单轮次（turn）和多轮次（chain）执行。

#### 核心接口

```typescript
interface TurnResult {
  status: "completed" | "aborted" | "suspended" | "errored";
  turnId: string;
  error?: Error;
  suspendInput?: unknown;
}

interface ChainOptions {
  maxTurns?: number;      // 最大轮次数（默认10）
  abortSignal?: AbortSignal;
}

interface ChainResult {
  status: "completed" | "max_turns" | "aborted" | "suspended" | "errored";
  turns: number;
  error?: Error;
}

interface HarnessOptions {
  store: CheckpointLog;
}

interface TurnCallbacks {
  onToken?: (token: string) => void;
  onThinking?: (token: string) => void;
}
```

#### 主要方法

- `runTurn(session, agent, opts?)` - 执行单个轮次
- `resume(sessionId, agent, externalInput?, opts?)` - 从挂起状态恢复
- `runChain(session, agent, opts?)` - 执行完整链路（多轮次）
- `resumeChain(sessionId, agent, externalInput?, opts?)` - 恢复并继续链路

### 3. 三层上下文模型

**文件**: `context.ts`

#### AgentContext（进程级）

```typescript
class AgentContext {
  readonly llm: LLMProvider;
  readonly tools: Map<string, Tool>;
  readonly handlerEngine: HandlerEngineHandle;
  readonly fragmentRegistry: PromptFragmentRegistry;
}
```

#### SessionContext（连接级，持久化）

```typescript
class SessionContext {
  readonly sessionId: string;
  readonly config: SessionConfig;
  readonly workingMemory: WorkingMemory;
  readonly costTracker: CostTracker;
}
```

#### TurnContext（轮次级，临时）

```typescript
class TurnContext {
  readonly turnId: string;
  readonly agent: AgentContext;
  readonly session: SessionContext;
  readonly messages: LLMMessage[];
  readonly toolResults: ToolResult[];
  readonly promptFragments: PromptFragment[];
  toolCalls?: ToolCall[];
  actions?: ToolCall[];
  externalInput?: unknown;
  onToken?: (token: string) => void;
  onThinking?: (token: string) => void;
}
```

#### HandlerContext（组合上下文）

```typescript
class HandlerContext {
  readonly agent: AgentContext;
  readonly session: SessionContext;
  readonly turn: TurnContext;
  
  freeze(timestamp?: number): FrozenContext;
}
```

#### FrozenContext（不可变快照）

```typescript
class FrozenContext {
  readonly timestamp: number;
  readonly checksum: string;
  readonly sessionId: string;
  readonly turnId: string;
  readonly messages: readonly LLMMessage[];
  readonly toolResults: readonly ToolResult[];
  readonly promptFragments: readonly PromptFragment[];
  readonly costTotals: { promptTokens: number; completionTokens: number };
  readonly resumeReason?: "suspend";
  readonly pendingInput?: unknown;
}
```

### 4. CheckpointStore（检查点存储）

**文件**: `checkpoint-store.ts`

#### 存储接口

```typescript
interface SessionStore {
  createSession(meta: SessionMeta): void;
  loadSession(sessionId: string): SessionMeta | undefined;
  updateSession(sessionId: string, patch: Partial<SessionMeta>): void;
  deleteSession(sessionId: string): void;
  listSessions(): SessionMeta[];
}

interface MessageStore {
  addMessages(sessionId: string, messages: LLMMessage[]): void;
  loadMessages(sessionId: string): LLMMessage[];
}

interface CheckpointLog {
  saveCheckpoint(checkpoint: FrozenContext): void;
  loadLatestCheckpoint(sessionId: string): FrozenContext | undefined;
  loadCheckpoint(sessionId: string, turnId: string): FrozenContext | undefined;
}

interface EventLog {
  appendEvent(event: StoreEvent): void;
  queryEvents(sessionId: string, since?: number): StoreEvent[];
}

interface ConfigStore {
  saveConfigSnapshot(snapshot: ConfigSnapshot): void;
  loadLatestConfigSnapshot(sessionId: string): ConfigSnapshot | undefined;
  listConfigSnapshots(sessionId: string): ConfigSnapshot[];
}

interface CostStore {
  addCostRecord(record: CostRecord): void;
  loadCostRecords(sessionId: string): CostRecord[];
}

type CheckpointStore = SessionStore & MessageStore & CheckpointLog & EventLog & ConfigStore & CostStore;
```

#### 数据类型

```typescript
interface SessionMeta {
  sessionId: string;
  config: SessionConfig;
  createdAt?: number;
  updatedAt?: number;
}

interface StoreEvent {
  sessionId: string;
  event: string;
  payload?: unknown;
  timestamp: number;
}

interface ConfigSnapshot {
  sessionId: string;
  handlers: unknown;
  timestamp: number;
  description?: string;
  checksum?: string;
}

interface CostRecord {
  sessionId: string;
  turnId: string;
  promptTokens: number;
  completionTokens: number;
  timestamp: number;
}
```

#### 实现

- **内存实现**: `InMemorySessionStore`, `InMemoryMessageStore`, `InMemoryCheckpointLog`, `InMemoryEventLog`, `InMemoryConfigStore`, `InMemoryCostStore`
- **SQLite实现**: `SqliteSessionStore`, `SqliteMessageStore`, `SqliteCheckpointLog`, `SqliteEventLog`, `SqliteConfigStore`, `SqliteCostStore`
- **工厂函数**: `createInMemoryStore()`, `createSqliteStore()`

### 5. LifecycleStateMachine（生命周期状态机）

**文件**: `lifecycle.ts`

```typescript
type LifecycleState = "pending" | "running" | "paused" | "completed" | "errored" | "cancelled";
type LifecycleEvent = "start" | "complete" | "suspend" | "resume" | "error" | "cancel";

class LifecycleStateMachine {
  constructor(initial?: LifecycleState);
  get state(): LifecycleState;
  canTransition(event: LifecycleEvent): boolean;
  transition(event: LifecycleEvent): LifecycleState;
  toJSON(): { state: LifecycleState };
  static fromJSON(data: { state: LifecycleState }): LifecycleStateMachine;
}
```

#### 状态转换图

```
pending → start → running
running → complete → completed
running → suspend → paused
running → error → errored
running → cancel → cancelled
paused → resume → running
errored → start → running
```

### 6. Processors（处理器）

**文件**: `processors.ts`

五阶段处理器实现：

#### ContextAssemblyProcessor

- 组装上下文消息
- 管理 KV-cache 前缀稳定性
- 注入系统提示词和用户片段

#### LLMInferenceProcessor

- 调用 LLM API
- 支持流式输出（onToken, onThinking）
- 更新成本追踪器

#### ActionResolutionProcessor

- 验证工具调用
- 存储已验证的操作

#### ToolExecutionProcessor

- 执行工具调用
- 支持自定义 ToolRunner

#### ResultObservationProcessor

- 将结果添加到工作内存
- 处理工具结果消息

### 7. LLM Provider（LLM 提供者）

**文件**: `llm/provider.ts`, `llm/protocols/openai-chat.ts`

```typescript
interface LLMProvider {
  chat(messages: LLMMessage[], tools: ToolDefinition[]): Promise<LLMResponse>;
  chatStream(messages: LLMMessage[], tools: ToolDefinition[]): AsyncIterable<LLMResponse>;
  countTokens(text: string): number;
}

interface LLMMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  thinking?: string;
  toolCalls?: ToolCall[];
  toolCallId?: string;
  name?: string;
}

interface LLMResponse {
  content: string;
  thinking?: string;
  toolCalls?: ToolCall[];
  usage: { promptTokens: number; completionTokens: number };
  finishReason: "stop" | "tool_call" | "length" | "error";
}
```

### 8. Tool（工具）

**文件**: `types.ts`

```typescript
interface Tool {
  definition: ToolDefinition;
  execute(params: Record<string, unknown>, context: ToolContext): Promise<ToolResult>;
}

interface ToolDefinition {
  name: string;
  description: string;
  parameters: JSONSchema;
  builtin?: boolean;
}

interface ToolResult {
  output: unknown;
  artifacts?: Artifact[];
  error?: { message: string; retryable: boolean };
}

interface ToolContext {
  turnId: string;
  sessionId: string;
}
```

### 9. OTel 可观测性

**文件**: `otel-adapter.ts`, `otel-bridge.ts`, `noop-tracer.ts`

```typescript
interface ProteusSpan {
  setAttribute(key: string, value: string | number | boolean): void;
  setStatus(status: { code: number; message?: string }): void;
  end(): void;
}

interface ProteusTracer {
  startSpan(name: string, options?: { attributes?: Record<string, unknown> }): ProteusSpan;
}

interface ProteusMetric {
  add(value: number, attributes?: Record<string, unknown>): void;
}
```

### 10. Governance（治理）

**文件**: `governance.ts`

```typescript
interface PermissionPolicy {
  checkPermission(toolName: string, params: unknown): PermissionDecision;
}

interface ResponsePolicy {
  checkResponse(response: unknown): ResponseDecision;
}

interface AuditEntry {
  timestamp: number;
  sessionId: string;
  turnId: string;
  event: string;
  details: unknown;
}
```

### 11. Evaluation（评估）

**文件**: `evaluation.ts`

```typescript
interface EvalSuite {
  name: string;
  tasks: EvalTask[];
  grader: EvalGrader;
}

interface EvalTask {
  name: string;
  input: string;
  expected: unknown;
}

interface EvalGrader {
  grade(task: EvalTask, actual: unknown): GradeResult;
}

interface EvalReport {
  suiteName: string;
  results: EvalTaskResult[];
  summary: { total: number; passed: number; failed: number };
}
```

### 12. Self-Modify（自修改）

**文件**: `self-modify.ts`

```typescript
interface SelfModifyToolOptions {
  gitRepoPath: string;
  snapshotManager: ConfigSnapshotManager;
  handlerEngine: HandlerEngine;
}

class SelfModifyTool implements Tool {
  definition: ToolDefinition;
  execute(params: SelfModifyParams, context: ToolContext): Promise<ToolResult>;
}
```

### 13. SessionManager（会话管理）

**文件**: `session-manager.ts`

```typescript
interface SessionManagerOptions {
  store: CheckpointStore;
  agentContext: AgentContext;
}

class SessionManager {
  createSession(config: SessionConfig): SessionContext;
  loadSession(sessionId: string): SessionContext | undefined;
  deleteSession(sessionId: string): void;
  listSessions(): SessionMeta[];
}
```

### 14. Worker Isolation（工作者隔离）

**文件**: `worker-pool.ts`, `worker-handler-runner.ts`

```typescript
interface WorkerPoolOptions {
  maxWorkers?: number;
  taskTimeout?: number;
}

class WorkerPool {
  constructor(opts?: WorkerPoolOptions);
  run(task: WorkerTask): Promise<WorkerResult>;
  terminate(): Promise<void>;
}

class WorkerHandlerRunner {
  constructor(pool: WorkerPool);
  run(handler: HandlerDefinition, payload: unknown): Promise<HandlerResult>;
}
```

### 15. PromptFragmentRegistry（提示片段注册表）

**文件**: `prompt-fragment-registry.ts`

```typescript
interface PromptFragmentEntry {
  name: string;
  fragment: PromptFragment;
  priority?: number;
}

class PromptFragmentRegistry {
  register(entry: PromptFragmentEntry): void;
  get(name: string): PromptFragment | undefined;
  getAll(): PromptFragmentEntry[];
  unregister(name: string): void;
}
```

### 16. MetricsCollector（指标收集器）

**文件**: `metrics-collector.ts`

```typescript
interface MetricsSnapshot {
  turnCount: number;
  toolCallCount: number;
  totalTokens: number;
  averageTurnDuration: number;
}

interface HealthStatus {
  status: "healthy" | "degraded" | "unhealthy";
  checks: Record<string, boolean>;
}

class MetricsCollector {
  recordTurn(duration: number): void;
  recordToolCall(toolName: string, duration: number): void;
  recordTokens(prompt: number, completion: number): void;
  getSnapshot(): MetricsSnapshot;
}
```

### 17. Watchdog（看门狗）

**文件**: `watchdog.ts`

```typescript
interface WatchdogThresholds {
  maxTurnDuration?: number;
  maxToolCallDuration?: number;
  maxErrorRate?: number;
}

interface WatchdogConfig {
  healthEndpoint: string;
  thresholds: WatchdogThresholds;
  checkInterval?: number;
}

class Watchdog {
  constructor(config: WatchdogConfig);
  start(): void;
  stop(): void;
  onAnomaly(handler: (event: AnomalyEvent) => void): void;
}
```

### 18. Failure Attribution（失败归因）

**文件**: `failure-attribution.ts`

```typescript
type AttributionCategory = "llm" | "tool" | "handler" | "system" | "user";

interface AttributionRecord {
  id: string;
  sessionId: string;
  turnId: string;
  category: AttributionCategory;
  description: string;
  timestamp: number;
}

interface AttributionStore {
  save(record: AttributionRecord): void;
  query(filter: AttributionFilter): AttributionRecord[];
}

class ETCLOVGLayer {
  attributeFailure(input: AttributeFailureInput): AttributionRecord;
}
```

### 19. Graders（评分器）

**文件**: `grader.ts`

```typescript
interface StringGrader {
  grade(expected: string, actual: string): GradeResult;
}

class ExactMatchGrader implements StringGrader {
  constructor(options?: ExactMatchOptions);
  grade(expected: string, actual: string): GradeResult;
}

class ContainsGrader implements StringGrader {
  grade(expected: string, actual: string): GradeResult;
}

class LLMJudgeGrader {
  constructor(options?: LLMJudgeOptions);
  grade(expected: string, actual: string): Promise<GradeResult>;
}
```

## Zod Schemas

### HandlerResultSchema

```typescript
const HandlerResultSchema = z.union([
  z.object({ ok: z.literal(true), value: z.optional(z.any()), transform: z.optional(z.literal(true)) }),
  z.object({ ok: z.literal(false), reason: z.string() }),
  z.object({ abort: z.boolean(), reason: z.string(), retryFrom: z.optional(z.string()) }),
  z.object({ suspend: z.boolean(), pendingInput: z.optional(z.any()) }),
  z.object({ error: z.object({ message: z.string() }), recoverable: z.optional(z.boolean()) })
]);
```

### SessionConfigSchema

```typescript
const SessionConfigSchema = z.object({
  sessionId: z.string(),
  llm: z.object({
    provider: z.string(),
    model: z.string(),
    temperature: z.number(),
  }),
  tools: z.record(z.any()),
  logLevel: z.enum(["debug", "info", "warn", "error"]),
});
```

### ToolDefinitionSchema

```typescript
const ToolDefinitionSchema = z.object({
  name: z.string(),
  description: z.string(),
  parameters: z.any(), // JSON Schema
  builtin: z.optional(z.boolean()),
});
```

## 公共 API 导出

### 核心类型

- `PromptFragment`, `ToolDefinition`, `ToolResult`, `Artifact`, `Tool`, `ToolContext`
- `LLMMessage`, `ToolCall`, `LLMResponse`, `LLMProvider`
- `PhaseName`, `HandlerDefinition`, `SessionConfig`
- `SandboxHandle`, `SandboxOptions`, `SandboxMount`, `SandboxResult`

### 核心类

- `HandlerEngine`, `registerBuiltins`, `BUILTIN_HANDLERS`
- `AgentContext`, `SessionContext`, `TurnContext`, `HandlerContext`, `FrozenContext`
- `CostTracker`, `WorkingMemory`
- `Harness`, `SubHarness`
- `LifecycleStateMachine`
- `ToolRegistry`
- `ConfigSnapshotManager`
- `SelfModifyTool`
- `SessionManager`
- `MetricsCollector`, `Watchdog`
- `PromptFragmentRegistry`, `PromptFragmentLoader`
- `OTelAdapter`, `NoopTracer`, `OTelBridgeHandler`
- `GovernanceHandler`, `AllowAllPolicy`, `DenyListPolicy`
- `EvaluationHarness`
- `ExactMatchGrader`, `ContainsGrader`, `LLMJudgeGrader`
- `ETCLOVGLayer`, `InMemoryAttributionStore`

### 工厂函数

- `createInMemoryStore()`, `createSqliteStore()`
- `createProvider()`, `createProtocol()`
- `createOTelAdapter()`
- `createGovernanceHandlers()`
- `createSchemaRegistry()`

### 处理器

- `ContextAssemblyProcessor`, `LLMInferenceProcessor`, `ActionResolutionProcessor`
- `ToolExecutionProcessor`, `ResultObservationProcessor`
- `registerBuiltInProcessors()`

### Worker 隔离

- `WorkerPool`, `WorkerHandlerRunner`, `buildContextSnapshot()`

### 工具

- `sha256()`

## 设计决策

1. **Go 风格错误处理** - 使用返回值而非 try-catch，支持短路语义
2. **优先级排序** - 处理器按优先级升序执行，相同优先级按插入顺序
3. **不可变快照** - FrozenContext 用于检查点和恢复
4. **三层隔离** - 支持不同信任级别的处理器隔离
5. **KV-cache 稳定性** - ContextAssemblyProcessor 管理系统消息前缀的哈希稳定性
