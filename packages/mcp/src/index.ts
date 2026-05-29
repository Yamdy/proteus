// @proteus/mcp — public API surface

// --- McpClient ---
export { McpClient } from "./client.js";
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
  Transport,
  StdioTransportOptions,
  SseTransportOptions,
} from "./types.js";

export { MCP_METHODS } from "./types.js";

// --- Transports ---
export { StdioTransport } from "./transport/stdio.js";
export { SseTransport } from "./transport/sse.js";
