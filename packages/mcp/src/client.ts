// McpClient — connect to MCP server, discover tools, forward calls

import type { Tool, ToolDefinition, ToolResult, ToolContext } from "@proteus/core";
import type {
  ClientTransport,
  McpToolDefinition,
  McpToolCallResult,
  McpClientInfo,
  McpServerInfo,
  JsonRpcResponse,
  StdioTransportOptions,
  SseTransportOptions,
} from "./types.js";
import { MCP_METHODS } from "./types.js";
import { StdioTransport } from "./transport/stdio.js";
import { SseTransport } from "./transport/sse.js";
import { fromMcpTool, fromMcpToolCallResult } from "./adapter.js";

export interface McpClientOptions {
  clientInfo?: McpClientInfo;
  maxRetries?: number;
  retryBaseDelayMs?: number;
}

export class McpClient {
  private transport: ClientTransport | null = null;
  private tools: Map<string, ToolDefinition> = new Map();
  private toolsDiscovered = false;
  private requestId = 0;
  private serverInfo: McpServerInfo | null = null;
  private readonly clientInfo: McpClientInfo;
  private readonly maxRetries: number;
  private readonly retryBaseDelayMs: number;

  constructor(options?: McpClientOptions) {
    this.clientInfo = options?.clientInfo ?? { name: "proteus-mcp-client", version: "0.0.1" };
    this.maxRetries = options?.maxRetries ?? 3;
    this.retryBaseDelayMs = options?.retryBaseDelayMs ?? 1000;
  }

  /** Connect via stdio transport (local MCP server). */
  async connectStdio(options: StdioTransportOptions): Promise<void> {
    await this.initialize(new StdioTransport(options));
  }

  /** Connect via SSE transport (remote MCP server). */
  async connectSse(options: SseTransportOptions): Promise<void> {
    const transport = new SseTransport(options);
    await transport.connect();
    await this.initialize(transport);
  }

  /** Connect with an arbitrary ClientTransport. */
  async connect(transport: ClientTransport): Promise<void> {
    await this.initialize(transport);
  }

  /** Disconnect from the server. */
  async disconnect(): Promise<void> {
    if (!this.transport) return;
    try {
      await this.transport.sendNotification({
        jsonrpc: "2.0",
        method: MCP_METHODS.SHUTDOWN,
      });
    } catch {
      // ignore shutdown errors
    }
    await this.transport.close();
    this.transport = null;
    this.tools.clear();
    this.toolsDiscovered = false;
    this.serverInfo = null;
  }

  /**
   * List available tools from the server (lazy discovery + cache).
   * First call fetches from server; subsequent calls return cached results.
   */
  async listTools(): Promise<ToolDefinition[]> {
    if (!this.transport) throw new Error("Not connected");

    if (!this.toolsDiscovered) {
      const response = await this.sendRequest(MCP_METHODS.LIST_TOOLS);
      const mcpTools = (response.result as { tools: McpToolDefinition[] })?.tools ?? [];
      this.tools.clear();
      for (const mcpDef of mcpTools) {
        const def = fromMcpTool(mcpDef);
        this.tools.set(def.name, def);
      }
      this.toolsDiscovered = true;
    }

    return Array.from(this.tools.values());
  }

  /**
   * Call a tool on the server with exponential backoff retry.
   * Retries up to `maxRetries` times on transient failures only.
   * Application-level errors (JSON-RPC error responses) are never retried.
   */
  async callTool(name: string, params: Record<string, unknown>): Promise<ToolResult> {
    if (!this.transport) throw new Error("Not connected");

    let lastError: Error | null = null;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await this.sendRequest(MCP_METHODS.CALL_TOOL, {
          name,
          arguments: params,
        });

        if (response.error) {
          // Application error — do not retry
          throw new McpError(response.error.code, response.error.message);
        }

        return fromMcpToolCallResult(response.result as McpToolCallResult);
      } catch (err) {
        if (err instanceof McpError) throw err; // application error, never retry

        lastError = err instanceof Error ? err : new Error(String(err));

        if (attempt < this.maxRetries) {
          const delay = this.retryBaseDelayMs * Math.pow(2, attempt);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError ?? new Error("callTool failed after retries");
  }

  /** Get a Proteus Tool that delegates to this MCP client. */
  getTool(name: string): Tool | null {
    const def = this.tools.get(name);
    if (!def) return null;

    return {
      definition: def,
      execute: async (params: Record<string, unknown>, _ctx: ToolContext) => {
        return this.callTool(name, params);
      },
    };
  }

  /** Get all discovered tools as Proteus Tools. */
  async getTools(): Promise<Tool[]> {
    await this.listTools();
    return Array.from(this.tools.keys())
      .map((name) => this.getTool(name))
      .filter((t): t is Tool => t !== null);
  }

  /** Whether the client is currently connected. */
  get connected(): boolean {
    return this.transport !== null;
  }

  /** Server info received during initialization. */
  get server(): McpServerInfo | null {
    return this.serverInfo;
  }

  // --- Private helpers ---

  private async initialize(transport: ClientTransport): Promise<void> {
    this.transport = transport;
    this.toolsDiscovered = false;
    this.tools.clear();

    // Send initialize request
    const response = await this.sendRequest(MCP_METHODS.INITIALIZE, {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: this.clientInfo,
    });

    if (response.error) {
      await transport.close();
      this.transport = null;
      throw new Error(`Initialize failed: ${response.error.message}`);
    }

    this.serverInfo = (response.result as { serverInfo: McpServerInfo })?.serverInfo ?? null;

    // Send initialized notification
    await this.transport.sendNotification({
      jsonrpc: "2.0",
      method: MCP_METHODS.INITIALIZED,
    });
  }

  private async sendRequest(method: string, params?: Record<string, unknown>): Promise<JsonRpcResponse> {
    if (!this.transport) throw new Error("Not connected");
    const id = ++this.requestId;
    return this.transport.sendRequest({ jsonrpc: "2.0", id, method, params });
  }
}

/** Application-level MCP error (JSON-RPC error response). Not retried. */
export class McpError extends Error {
  constructor(
    public readonly code: number,
    message: string,
  ) {
    super(message);
    this.name = "McpError";
  }
}
