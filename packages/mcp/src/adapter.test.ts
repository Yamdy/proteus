// Tests for McpToolAdapter — bidirectional MCP ↔ Proteus type conversion

import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
  fromMcpTool,
  toMcpTool,
  fromMcpToolCallResult,
  toMcpToolCallResult,
} from "./adapter.js";
import type { McpToolDefinition, McpToolCallResult } from "./types.js";
import type { Tool, ToolResult } from "@proteus/core";

describe("McpToolAdapter", () => {
  describe("fromMcpTool", () => {
    it("converts MCP tool definition to Proteus ToolDefinition", () => {
      const mcpDef: McpToolDefinition = {
        name: "test-tool",
        description: "A test tool",
        inputSchema: {
          type: "object",
          properties: {
            query: { type: "string", description: "Search query" },
          },
          required: ["query"],
        },
      };

      const result = fromMcpTool(mcpDef);

      expect(result.name).toBe("test-tool");
      expect(result.description).toBe("A test tool");
      expect(result.parameters).toEqual(mcpDef.inputSchema);
    });

    it("handles missing description", () => {
      const mcpDef: McpToolDefinition = {
        name: "minimal-tool",
        inputSchema: { type: "object" },
      };

      const result = fromMcpTool(mcpDef);

      expect(result.description).toBe("");
    });
  });

  describe("toMcpTool", () => {
    it("converts Proteus Tool with JSON Schema parameters to MCP definition", () => {
      const tool: Tool = {
        definition: {
          name: "proteus-tool",
          description: "A Proteus tool",
          parameters: {
            type: "object",
            properties: {
              input: { type: "string" },
            },
            required: ["input"],
          },
        },
        execute: async () => ({ output: "ok" }),
      };

      const result = toMcpTool(tool);

      expect(result.name).toBe("proteus-tool");
      expect(result.description).toBe("A Proteus tool");
      expect(result.inputSchema).toEqual(tool.definition.parameters);
    });

    it("converts Proteus Tool with Zod schema parameters to MCP definition", () => {
      const schema = z.object({
        query: z.string().describe("Search query"),
        limit: z.number().optional(),
      });

      const tool: Tool = {
        definition: {
          name: "zod-tool",
          description: "Tool with Zod schema",
          parameters: schema as unknown as Record<string, unknown>,
        },
        execute: async () => ({ output: "ok" }),
      };

      const result = toMcpTool(tool);

      expect(result.name).toBe("zod-tool");
      expect(result.inputSchema).toBeDefined();
      expect(result.inputSchema.type).toBe("object");
      expect(result.inputSchema.properties).toBeDefined();
    });
  });

  describe("fromMcpToolCallResult", () => {
    it("converts successful MCP result to Proteus ToolResult", () => {
      const mcpResult: McpToolCallResult = {
        content: [{ type: "text", text: "result text" }],
        isError: false,
      };

      const result = fromMcpToolCallResult(mcpResult);

      expect(result.output).toBe("result text");
      expect(result.error).toBeUndefined();
    });

    it("converts error MCP result to Proteus ToolResult with error", () => {
      const mcpResult: McpToolCallResult = {
        content: [{ type: "text", text: "something went wrong" }],
        isError: true,
      };

      const result = fromMcpToolCallResult(mcpResult);

      expect(result.output).toBeNull();
      expect(result.error).toBeDefined();
      expect(result.error!.message).toBe("something went wrong");
      expect(result.error!.retryable).toBe(false);
    });

    it("joins multiple text content items", () => {
      const mcpResult: McpToolCallResult = {
        content: [
          { type: "text", text: "line 1" },
          { type: "text", text: "line 2" },
        ],
      };

      const result = fromMcpToolCallResult(mcpResult);

      expect(result.output).toBe("line 1\nline 2");
    });
  });

  describe("toMcpToolCallResult", () => {
    it("converts successful Proteus ToolResult to MCP result", () => {
      const toolResult: ToolResult = {
        output: "success output",
      };

      const result = toMcpToolCallResult(toolResult);

      expect(result.isError).toBe(false);
      expect(result.content).toEqual([{ type: "text", text: "success output" }]);
    });

    it("converts Proteus ToolResult with object output to MCP result", () => {
      const toolResult: ToolResult = {
        output: { key: "value", count: 42 },
      };

      const result = toMcpToolCallResult(toolResult);

      expect(result.isError).toBe(false);
      expect(result.content).toEqual([
        { type: "text", text: '{"key":"value","count":42}' },
      ]);
    });

    it("converts error Proteus ToolResult to MCP result", () => {
      const toolResult: ToolResult = {
        output: null,
        error: { message: "tool failed", retryable: true },
      };

      const result = toMcpToolCallResult(toolResult);

      expect(result.isError).toBe(true);
      expect(result.content).toEqual([{ type: "text", text: "tool failed" }]);
    });
  });
});
