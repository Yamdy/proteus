// @proteus/server — HTTP/WS service

export type {
  TurnContext,
  Tool,
  ToolDefinition,
  ToolResult,
  LLMProvider,
  SessionConfig,
  HandlerEngine,
  LifecycleStateMachine,
  HandlerResult,
  HandlerFn,
  PhaseName,
  HandlerDefinition,
  CheckpointStore,
  SessionStore,
  MessageStore,
  CheckpointLog,
  EventLog,
  ConfigStore,
  CostStore,
  SessionMeta,
  StoreEvent,
  ConfigSnapshot,
  CostRecord,
  InMemoryCheckpointStore,
  SqliteCheckpointStore,
  Harness,
  TurnResult,
} from "@proteus/core";

// Server implementation
export { ProteusServer, createServer } from "./server.js";
export type { ServerOptions } from "./server.js";

// Route registration
export { registerMetricsRoutes } from "./routes/metrics.js";
export type { MetricsRoutesOptions } from "./routes/metrics.js";
