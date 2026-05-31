// @proteus/sdk — embeddable language API

// --- SDK class + options ---
export { ProteusSDK } from "./sdk.js";
export type { SDKOptions } from "./sdk.js";

// --- Re-exported types from @proteus/core ---
export type {
  TurnContext,
  PromptFragment,
  Tool,
  ToolDefinition,
  ToolResult,
  Artifact,
  LLMProvider,
  LLMMessage,
  LLMResponse,
  ToolCall,
  PhaseName,
  HandlerDefinition,
  HandlerResult,
  HandlerFn,
  SessionConfig,
  WorkingMemory,
  HandlerEngine,
  LifecycleStateMachine,
  LifecycleState,
  LifecycleEvent,
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
  Harness,
  TurnResult,
} from "@proteus/core";
