// @proteus/mcp — public API surface

// --- McpClient ---
export { McpClient, McpError } from "./client.js";
export type { McpClientOptions } from "./client.js";

// --- McpServer ---
export { McpServer } from "./server.js";
export type { McpServerOptions } from "./server.js";

// --- McpToolAdapter ---
export {
  fromMcpTool,
  toMcpTool,
  fromMcpToolCallResult,
  toMcpToolCallResult,
} from "./adapter.js";

// --- Types ---
export type {
  JsonRpcRequest,
  JsonRpcResponse,
  JsonRpcError,
  JsonRpcNotification,
  McpToolDefinition,
  McpToolCallParams,
  McpToolCallResult,
  McpContent,
  McpServerInfo,
  McpServerCapabilities,
  McpClientInfo,
  JsonSchema,
  ClientTransport,
  ServerTransport,
  StdioTransportOptions,
  SseTransportOptions,
} from "./types.js";

export { MCP_METHODS } from "./types.js";

// --- Transports ---
export { AbstractTransport } from "./transport/abstract.js";
export type { AbstractTransportOptions } from "./transport/abstract.js";
export { StdioTransport } from "./transport/stdio.js";
export { SseTransport } from "./transport/sse.js";
