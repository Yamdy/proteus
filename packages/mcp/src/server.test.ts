// Tests for McpServer — tool registration, HTTP request handling
// All tests use real HTTP requests to a running server

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { McpServer } from "./server.js";
import type { Tool } from "@proteus/core";
import type { JsonRpcRequest, JsonRpcResponse } from "./types.js";
import { MCP_METHODS } from "./types.js";

function makeTool(name: string, output: unknown = "ok"): Tool {
  return {
    definition: { name, description: `Tool ${name}`, parameters: { type: "object", properties: { input: { type: "string" } } } },
    execute: async () => ({ output }),
  };
}

function makeErrorTool(name: string, message: string): Tool {
  return {
    definition: { name, description: `Error tool`, parameters: { type: "object" } },
    execute: async () => { throw new Error(message); },
  };
}

/** Send a JSON-RPC request to the server via HTTP. */
async function sendRpc(port: number, request: JsonRpcRequest): Promise<JsonRpcResponse> {
  const res = await fetch(`http://127.0.0.1:${port}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  return res.json();
}

let port = 0;

function nextPort(): number {
  return 19100 + Math.floor(Math.random() * 900);
}

describe("McpServer", () => {
  describe("tool registration", () => {
    it("registers tools and lists them via handleMessage", async () => {
      const server = new McpServer();
      server.registerTool(makeTool("a"));
      server.registerTool(makeTool("b"));

      const response = await server.handleMessage({
        jsonrpc: "2.0", id: 1, method: MCP_METHODS.LIST_TOOLS,
      });

      const tools = (response!.result as any).tools;
      expect(tools).toHaveLength(2);
      expect(tools.map((t: any) => t.name)).toContain("a");
      expect(tools.map((t: any) => t.name)).toContain("b");
    });
  });

  describe("handleMessage — initialize", () => {
    it("returns server info and capabilities", async () => {
      const server = new McpServer({ serverInfo: { name: "my-server", version: "2.0" } });
      const response = await server.handleMessage({
        jsonrpc: "2.0", id: 1, method: MCP_METHODS.INITIALIZE, params: {},
      });

      expect(response!.id).toBe(1);
      expect((response!.result as any).serverInfo.name).toBe("my-server");
      expect((response!.result as any).protocolVersion).toBe("2024-11-05");
    });
  });

  describe("handleMessage — tools/call", () => {
    it("executes tool and returns MCP result", async () => {
      const server = new McpServer();
      server.registerTool(makeTool("echo", "hello"));

      const response = await server.handleMessage({
        jsonrpc: "2.0", id: 2, method: MCP_METHODS.CALL_TOOL,
        params: { name: "echo", arguments: { input: "hi" } },
      });

      const result = response!.result as any;
      expect(result.isError).toBe(false);
      expect(result.content[0].text).toBe("hello");
    });

    it("returns error for unknown tool", async () => {
      const server = new McpServer();
      const response = await server.handleMessage({
        jsonrpc: "2.0", id: 3, method: MCP_METHODS.CALL_TOOL,
        params: { name: "nope" },
      });

      expect(response!.error).toBeDefined();
      expect(response!.error!.code).toBe(-32602);
    });

    it("returns error for tool execution failure", async () => {
      const server = new McpServer();
      server.registerTool(makeErrorTool("boom", "kaboom"));

      const response = await server.handleMessage({
        jsonrpc: "2.0", id: 4, method: MCP_METHODS.CALL_TOOL,
        params: { name: "boom" },
      });

      expect(response!.error).toBeDefined();
      expect(response!.error!.code).toBe(-32000);
      expect(response!.error!.message).toContain("kaboom");
    });
  });

  describe("handleMessage — errors", () => {
    it("returns -32601 for unknown method", async () => {
      const server = new McpServer();
      const response = await server.handleMessage({
        jsonrpc: "2.0", id: 5, method: "unknown/method",
      });

      expect(response!.error!.code).toBe(-32601);
    });

    it("returns null for notifications", async () => {
      const server = new McpServer();
      const response = await server.handleMessage({
        jsonrpc: "2.0", method: MCP_METHODS.INITIALIZED,
      });
      expect(response).toBeNull();
    });
  });

  describe("HTTP server", () => {
    let server: McpServer;

    beforeEach(() => {
      server = new McpServer({ serverInfo: { name: "http-test", version: "1.0" } });
    });

    afterEach(async () => {
      await server.stop();
    });

    it("handles real HTTP POST requests", async () => {
      port = nextPort();
      await server.start(port);

      server.registerTool(makeTool("ping", "pong"));

      // Initialize
      const initRes = await sendRpc(port, {
        jsonrpc: "2.0", id: 1, method: MCP_METHODS.INITIALIZE, params: {},
      });
      expect((initRes.result as any).serverInfo.name).toBe("http-test");

      // List tools
      const listRes = await sendRpc(port, {
        jsonrpc: "2.0", id: 2, method: MCP_METHODS.LIST_TOOLS,
      });
      expect((listRes.result as any).tools).toHaveLength(1);

      // Call tool
      const callRes = await sendRpc(port, {
        jsonrpc: "2.0", id: 3, method: MCP_METHODS.CALL_TOOL,
        params: { name: "ping" },
      });
      expect((callRes.result as any).content[0].text).toBe("pong");
    });

    it("rejects non-POST requests with 405", async () => {
      port = nextPort();
      await server.start(port);

      const res = await fetch(`http://127.0.0.1:${port}`, { method: "GET" });
      expect(res.status).toBe(405);
    });

    it("rejects invalid JSON with 400", async () => {
      port = nextPort();
      await server.start(port);

      const res = await fetch(`http://127.0.0.1:${port}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not json{{{",
      });
      // Should get a parse error response (200 with JSON-RPC error, or 400)
      expect(res.ok).toBe(false);
    });
  });
});
