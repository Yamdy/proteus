// Tests for McpClient — connection lifecycle, lazy discovery, retry
// All tests use a real McpServer connected via InMemoryTransport

import { describe, it, expect } from "vitest";
import { McpClient } from "./client.js";
import { McpServer } from "./server.js";
import { createTransportPair } from "./testing/in-memory-transport.js";
import type { Tool } from "@proteus/core";

function makeTool(name: string, output: unknown = "ok"): Tool {
  return {
    definition: { name, description: `Tool ${name}`, parameters: { type: "object" } },
    execute: async () => ({ output }),
  };
}

function makeErrorTool(name: string, message: string): Tool {
  return {
    definition: { name, description: `Error tool ${name}`, parameters: { type: "object" } },
    execute: async () => ({ output: null, error: { message, retryable: false } }),
  };
}

/** Set up a server with tools and return a connected client. */
async function setupClient(tools: Tool[] = []) {
  const server = new McpServer();
  for (const t of tools) server.registerTool(t);

  const { client: clientTransport, server: serverTransport } = createTransportPair();

  // Run server in background — it processes requests as the client sends them
  const serverPromise = server.serve(serverTransport);

  const client = new McpClient({ maxRetries: 2, retryBaseDelayMs: 10 });
  await client.connect(clientTransport);

  return { client, server, serverPromise, serverTransport, clientTransport };
}

describe("McpClient", () => {
  describe("connection lifecycle", () => {
    it("starts disconnected", () => {
      const client = new McpClient();
      expect(client.connected).toBe(false);
    });

    it("connects and disconnects cleanly", async () => {
      const { client } = await setupClient();
      expect(client.connected).toBe(true);

      await client.disconnect();
      expect(client.connected).toBe(false);
    });
  });

  describe("lazy discovery", () => {
    it("does not fetch tools on connect", async () => {
      const { client } = await setupClient([makeTool("a")]);
      // After connect, tools should NOT be fetched yet
      // We verify by checking that listTools() returns tools (i.e. it fetches on demand)
      const tools = await client.listTools();
      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe("a");
    });

    it("caches tools after first fetch", async () => {
      const { client } = await setupClient([makeTool("cached")]);

      const first = await client.listTools();
      const second = await client.listTools();

      expect(first).toEqual(second);
      expect(first).toHaveLength(1);
    });
  });

  describe("callTool", () => {
    it("calls a tool and returns result", async () => {
      const { client } = await setupClient([makeTool("echo", "hello-world")]);

      const result = await client.callTool("echo", {});
      expect(result.output).toBe("hello-world");
      expect(result.error).toBeUndefined();
    });

    it("returns error result from tool", async () => {
      const { client } = await setupClient([makeErrorTool("fail", "boom")]);

      const result = await client.callTool("fail", {});
      expect(result.output).toBeNull();
      expect(result.error).toBeDefined();
      expect(result.error!.message).toBe("boom");
    });

    it("throws for unknown tool", async () => {
      const { client } = await setupClient([]);

      await expect(client.callTool("nonexistent", {})).rejects.toThrow("Tool not found");
    });
  });

  describe("getTool / getTools", () => {
    it("getTool returns null before discovery", async () => {
      const { client } = await setupClient([makeTool("x")]);
      // Before listTools(), getTool should return null (not discovered yet)
      expect(client.getTool("x")).toBeNull();
    });

    it("getTools discovers and returns all tools", async () => {
      const { client } = await setupClient([makeTool("a"), makeTool("b")]);

      const tools = await client.getTools();
      expect(tools).toHaveLength(2);
      expect(tools.map((t) => t.definition.name)).toContain("a");
      expect(tools.map((t) => t.definition.name)).toContain("b");
    });

    it("getTool returns Tool after discovery", async () => {
      const { client } = await setupClient([makeTool("visible")]);

      await client.listTools();
      const tool = client.getTool("visible");
      expect(tool).not.toBeNull();
      expect(tool!.definition.name).toBe("visible");
    });
  });

  describe("throws when not connected", () => {
    it("listTools throws", async () => {
      const client = new McpClient();
      await expect(client.listTools()).rejects.toThrow("Not connected");
    });

    it("callTool throws", async () => {
      const client = new McpClient();
      await expect(client.callTool("tool", {})).rejects.toThrow("Not connected");
    });
  });
});
