// MCP protocol types — JSON-RPC messages, tool definitions, call results

// --- JSON-RPC base ---

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: number | string;
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number | string;
  result?: unknown;
  error?: JsonRpcError;
}

export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

export interface JsonRpcNotification {
  jsonrpc: "2.0";
  method: string;
  params?: Record<string, unknown>;
}

// --- MCP tool definition ---

export interface McpToolDefinition {
  name: string;
  description?: string;
  inputSchema: JsonSchema;
}

// --- MCP tool call ---

export interface McpToolCallParams {
  name: string;
  arguments?: Record<string, unknown>;
}

export interface McpToolCallResult {
  content: McpContent[];
  isError?: boolean;
}

export type McpContent =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string }
  | { type: "resource"; resource: { uri: string; text?: string; mimeType?: string } };

// --- MCP server info ---

export interface McpServerInfo {
  name: string;
  version: string;
  capabilities?: McpServerCapabilities;
}

export interface McpServerCapabilities {
  tools?: { listChanged?: boolean };
  resources?: { subscribe?: boolean; listChanged?: boolean };
  prompts?: { listChanged?: boolean };
  logging?: Record<string, unknown>;
}

// --- MCP client info ---

export interface McpClientInfo {
  name: string;
  version: string;
}

// --- JSON Schema (subset used by MCP) ---

export interface JsonSchema {
  type?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  enum?: unknown[];
  description?: string;
  default?: unknown;
  additionalProperties?: boolean | JsonSchema;
  $ref?: string;
  oneOf?: JsonSchema[];
  anyOf?: JsonSchema[];
  allOf?: JsonSchema[];
}

// --- Transport types ---

export interface Transport {
  send(message: JsonRpcRequest | JsonRpcNotification): Promise<void>;
  receive(): Promise<JsonRpcResponse>;
  close(): Promise<void>;
}

export interface StdioTransportOptions {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface SseTransportOptions {
  url: string;
  headers?: Record<string, string>;
}

// --- MCP method constants ---

export const MCP_METHODS = {
  INITIALIZE: "initialize",
  INITIALIZED: "notifications/initialized",
  LIST_TOOLS: "tools/list",
  CALL_TOOL: "tools/call",
  SHUTDOWN: "shutdown",
} as const;
