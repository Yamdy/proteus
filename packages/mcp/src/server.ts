// McpServer — expose ToolRegistry as an MCP server

import type { Tool, ToolRegistry, ToolResult, ToolContext } from "@proteus/core";
import type {
  McpServerInfo,
  McpToolDefinition,
  McpToolCallResult,
  JsonRpcRequest,
  JsonRpcResponse,
  JsonRpcNotification,
  ServerTransport,
} from "./types.js";
import { MCP_METHODS } from "./types.js";
import { toMcpTool, toMcpToolCallResult } from "./adapter.js";

export interface McpServerOptions {
  port?: number;
  host?: string;
  serverInfo?: McpServerInfo;
}

export class McpServer {
  private tools: Map<string, Tool> = new Map();
  private serverInfo: McpServerInfo;
  private httpServer: import("node:http").Server | null = null;
  private running = false;

  constructor(options?: McpServerOptions) {
    this.serverInfo = options?.serverInfo ?? {
      name: "proteus-mcp-server",
      version: "0.0.1",
      capabilities: {
        tools: { listChanged: false },
      },
    };
  }

  /** Register a single tool. */
  registerTool(tool: Tool): void {
    this.tools.set(tool.definition.name, tool);
  }

  /** Register all tools from a ToolRegistry. */
  registerFromRegistry(_registry: ToolRegistry): void {
    // ToolRegistry exposes tools via getTool() — integration point
    // In practice, registry would have a list() method
  }

  /** Start the MCP server on the given port. */
  async start(port: number, host = "127.0.0.1"): Promise<void> {
    const http = await import("node:http");

    this.httpServer = http.createServer((req, res) => {
      this.handleRequest(req, res);
    });

    return new Promise<void>((resolve, reject) => {
      this.httpServer!.listen(port, host, () => {
        resolve();
      });
      this.httpServer!.on("error", reject);
    });
  }

  /**
   * Serve on a ServerTransport — read requests, process, write responses.
   * Resolves when the transport is closed or an error occurs.
   */
  async serve(transport: ServerTransport): Promise<void> {
    this.running = true;
    while (this.running) {
      try {
        const message = await transport.receive();
        const response = await this.handleMessage(message as JsonRpcRequest | JsonRpcNotification);
        if (response) {
          await transport.send(response);
        }
      } catch {
        break; // transport closed or error
      }
    }
  }

  /** Stop the server. */
  async stop(): Promise<void> {
    if (!this.httpServer) return;
    return new Promise<void>((resolve, reject) => {
      this.httpServer!.close((err) => {
        if (err) reject(err);
        else {
          this.httpServer = null;
          resolve();
        }
      });
    });
  }

  /** Handle an incoming JSON-RPC request. */
  async handleRequest(
    req: import("node:http").IncomingMessage,
    res: import("node:http").ServerResponse,
  ): Promise<void> {
    // Only accept POST
    if (req.method !== "POST") {
      res.writeHead(405, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Method not allowed" }));
      return;
    }

    // Read body
    const body = await this.readBody(req);
    let request: JsonRpcRequest | JsonRpcNotification;

    try {
      request = JSON.parse(body);
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify(this.errorResponse(null, -32700, "Parse error")));
      return;
    }

    // Handle the request
    const response = await this.handleMessage(request);

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(response));
  }

  /** Process a JSON-RPC message and return a response. */
  async handleMessage(
    message: JsonRpcRequest | JsonRpcNotification,
  ): Promise<JsonRpcResponse | null> {
    // Notifications don't have an id — no response needed
    if (!("id" in message)) {
      this.handleNotification(message);
      return null;
    }

    const request = message as JsonRpcRequest;

    switch (request.method) {
      case MCP_METHODS.INITIALIZE:
        return this.handleInitialize(request);
      case MCP_METHODS.LIST_TOOLS:
        return this.handleListTools(request);
      case MCP_METHODS.CALL_TOOL:
        return this.handleCallTool(request);
      default:
        return this.errorResponse(request.id, -32601, `Method not found: ${request.method}`);
    }
  }

  // --- Private handlers ---

  private handleInitialize(request: JsonRpcRequest): JsonRpcResponse {
    return {
      jsonrpc: "2.0",
      id: request.id,
      result: {
        protocolVersion: "2024-11-05",
        serverInfo: this.serverInfo,
        capabilities: this.serverInfo.capabilities ?? {},
      },
    };
  }

  private handleListTools(request: JsonRpcRequest): JsonRpcResponse {
    const mcpTools: McpToolDefinition[] = [];
    for (const tool of this.tools.values()) {
      mcpTools.push(toMcpTool(tool));
    }

    return {
      jsonrpc: "2.0",
      id: request.id,
      result: { tools: mcpTools },
    };
  }

  private async handleCallTool(request: JsonRpcRequest): Promise<JsonRpcResponse> {
    const params = request.params as { name: string; arguments?: Record<string, unknown> } | undefined;
    if (!params?.name) {
      return this.errorResponse(request.id, -32602, "Missing tool name");
    }

    const tool = this.tools.get(params.name);
    if (!tool) {
      return this.errorResponse(request.id, -32602, `Tool not found: ${params.name}`);
    }

    try {
      const toolContext: ToolContext = {
        turnId: crypto.randomUUID(),
        sessionId: "mcp",
      };
      const result: ToolResult = await tool.execute(params.arguments ?? {}, toolContext);
      const mcpResult: McpToolCallResult = toMcpToolCallResult(result);

      return {
        jsonrpc: "2.0",
        id: request.id,
        result: mcpResult,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return this.errorResponse(request.id, -32000, `Tool execution error: ${message}`);
    }
  }

  private handleNotification(notification: JsonRpcNotification): void {
    switch (notification.method) {
      case MCP_METHODS.INITIALIZED:
        // Client confirmed initialization
        break;
      case MCP_METHODS.SHUTDOWN:
        // Graceful shutdown
        break;
    }
  }

  private errorResponse(id: number | string | null, code: number, message: string): JsonRpcResponse {
    return {
      jsonrpc: "2.0",
      id: id ?? 0,
      error: { code, message },
    };
  }

  private readBody(req: import("node:http").IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      req.on("data", (chunk) => chunks.push(chunk));
      req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
      req.on("error", reject);
    });
  }
}
