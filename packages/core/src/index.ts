// @proteus/core — public API surface

// --- Core Types (from types.ts — breaks circular deps) ---
export type {
  PromptFragment,
  ToolDefinition,
  ToolResult,
  Artifact,
  Tool,
  ToolContext,
  LLMMessage,
  ToolCall,
  LLMResponse,
  LLMProvider,
  PhaseName,
  HandlerDefinition,
  SessionConfig,
  SandboxHandle,
  SandboxOptions,
  SandboxMount,
  SandboxResult,
} from "./types.js";

// --- Handler Engine ---
export { HandlerEngine, registerBuiltins, BUILTIN_HANDLERS } from "./handler-engine.js";
export type { HandlerResult, HandlerFn } from "./types.js";
export type { HandlerSnapshot, RegistrySnapshot } from "./handler-engine.js";

// --- Worker Isolation ---
export { WorkerPool } from "./worker-pool.js";
export type { WorkerPoolOptions, WorkerTask, WorkerResult as WorkerPoolResult } from "./worker-pool.js";
export { WorkerHandlerRunner, buildContextSnapshot } from "./worker-handler-runner.js";

// --- Three-Region Context ---
export {
  AgentContext,
  SessionContext,
  TurnContext,
  HandlerContext,
  FrozenContext,
  CostTracker,
  WorkingMemory,
} from "./context.js";
export type { HandlerEngineHandle } from "./context.js";

// --- CheckpointStore ---
export { InMemoryCheckpointStore, createInMemoryStore, InMemorySessionStore, InMemoryMessageStore, InMemoryCheckpointLog, InMemoryEventLog, InMemoryConfigStore, InMemoryCostStore } from "./checkpoint-store.js";
export type { CheckpointStore, SessionStore, MessageStore, CheckpointLog, EventLog, ConfigStore, CostStore, SessionMeta, StoreEvent, ConfigSnapshot, CostRecord } from "./checkpoint-store.js";
export { SqliteCheckpointStore, createSqliteStore, SqliteSessionStore, SqliteMessageStore, SqliteCheckpointLog, SqliteEventLog, SqliteConfigStore, SqliteCostStore } from "./sqlite-checkpoint-store.js";

// --- Harness ---
export { Harness } from "./harness.js";
export type { TurnResult, ChainResult, ChainOptions, HarnessOptions, TurnCallbacks } from "./harness.js";

// --- SubHarness ---
export { SubHarness } from "./sub-harness.js";
export type { IsolationMode, CompactionFn, SubHarnessOptions, SubHarnessResult } from "./sub-harness.js";

// --- Lifecycle ---
export { LifecycleStateMachine } from "./lifecycle.js";
export type { LifecycleState, LifecycleEvent } from "./lifecycle.js";

// --- DevServer ---
export { DevServer } from "./dev-server.js";
export type { DevServerOptions, SSEEvent } from "./dev-server.js";

// --- LLM (Provider + Protocol) ---
export { createProvider, createProtocol } from "./llm/index.js";
export type { ProviderConfig, OpenAIChatConfig, OpenAIChatProtocol } from "./llm/index.js";

// --- ToolRegistry ---
export { ToolRegistry } from "./tool-registry.js";

// --- ConfigSnapshotManager ---
export { ConfigSnapshotManager } from "./config-snapshot-manager.js";

// --- SelfModifyTool ---
export { SelfModifyTool, SelfModifyParams } from "./self-modify.js";
export type { SelfModifyToolOptions, SelfModifyParamsType } from "./self-modify.js";

// --- SessionManager ---
export { SessionManager } from "./session-manager.js";
export type { SessionManagerOptions } from "./session-manager.js";

// --- ExecutionEnvironment (shell + filesystem + sandbox) ---
export type {
  ExecutionEnvironment,
  ExecOptions,
  ExecResult,
} from "./execution-env.js";
export { LocalExecutionEnvironment } from "./local-execution-env.js";

// --- Processors ---
export {
  ContextAssemblyProcessor,
  LLMInferenceProcessor,
  ActionResolutionProcessor,
  ToolExecutionProcessor,
  ResultObservationProcessor,
  registerBuiltInProcessors,
} from "./processors.js";
export type { ContextAssemblyOptions } from "./processors.js";

// --- ChatServer ---
export { ChatServer } from "./chat-server.js";
export type { ChatServerOptions } from "./chat-server.js";

// --- MetricsCollector ---
export { MetricsCollector, registerMetricsCollector, deriveHealthStatus, buildHealthResponse } from "./metrics-collector.js";
export type { MetricsSnapshot, HealthStatus, HealthMetricsInput, HealthResponse } from "./metrics-collector.js";

// --- Watchdog ---
export { Watchdog } from "./watchdog.js";
export type { WatchdogState, HealthFetchResult, WatchdogThresholds, AnomalyEvent, WatchdogConfig, ExecFileFn, HealthFetchFn } from "./watchdog.js";

// --- PromptFragmentRegistry ---
export {
  PromptFragmentRegistry,
} from "./prompt-fragment-registry.js";
export type {
  PromptFragmentEntry,
  SerializedFragment,
  SerializedFragments,
} from "./prompt-fragment-registry.js";

// --- PromptFragmentLoader ---
export {
  PromptFragmentLoader,
  createPromptFragmentLoaderHandler,
} from "./prompt-fragment-loader.js";

// --- OTel Observability ---
export type { ProteusSpan, ProteusTracer, ProteusMetric, OTelConfig } from "./otel-adapter.js";
export { OTelAdapter, createOTelAdapter } from "./otel-adapter.js";
export { NoopTracer, NoopMetric } from "./noop-tracer.js";
export { OTelBridgeHandler, createOTelBridgeHandlers, registerOTelBridge } from "./otel-bridge.js";

// --- Governance / Audit Log ---
export {
  GovernanceHandler,
  createGovernanceHandlers,
  registerGovernance,
  AllowAllPolicy,
  DenyListPolicy,
  GovernanceManager,
  GovernanceHooks,
} from "./governance.js";
export type {
  AuditEntry,
  PermissionDecision,
  PermissionPolicy,
  ResponseDecision,
  ResponsePolicy,
  GovernanceManagerOptions,
  BeforeLlmHook,
} from "./governance.js";

// --- Evaluation ---
export { EvaluationHarness } from "./evaluation.js";
export type {
  EvalSuite,
  EvalTask,
  EvalGrader,
  GradeResult,
  EvalReport,
  EvalTaskResult,
  EvaluationHarnessOptions,
  RunSuiteOptions,
} from "./evaluation.js";

// --- Graders ---
export { ExactMatchGrader, ContainsGrader, LLMJudgeGrader } from "./grader.js";
export type { StringGrader, ExactMatchOptions, LLMJudgeOptions } from "./grader.js";

// --- Failure Attribution ---
export { ETCLOVGLayer, InMemoryAttributionStore, attributeFailure } from "./failure-attribution.js";
export type {
  AttributionCategory,
  AttributionRecord,
  AttributionFilter,
  AttributionStore,
  AttributeFailureInput,
} from "./failure-attribution.js";

// --- Utilities ---
export { sha256 } from "./utils/hash.js";

// --- Zod Schemas ---
export { HandlerResultSchema } from "./schemas/index.js";
export type { InferredHandlerResult } from "./schemas/index.js";
export { SessionConfigSchema, SessionLLMConfigSchema } from "./schemas/index.js";
export type { SessionConfigInferred, SessionLLMConfig } from "./schemas/index.js";
export { ToolDefinitionSchema, ToolResultSchema, ArtifactSchema } from "./schemas/index.js";
export type { InferredToolDefinition, InferredToolResult, InferredArtifact } from "./schemas/index.js";
export { SchemaRegistry, createSchemaRegistry } from "./schemas/index.js";
export type { ValidationResult } from "./schemas/index.js";
