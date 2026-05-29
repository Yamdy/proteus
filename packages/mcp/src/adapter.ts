// McpToolAdapter — bidirectional conversion between MCP tool defs and Proteus Tool

import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { Tool, ToolDefinition, ToolResult } from "@proteus/core";
import type { McpToolDefinition, McpToolCallResult, JsonSchema, McpContent } from "./types.js";

/**
 * Convert an MCP tool definition to a Proteus ToolDefinition.
 * The returned definition has a JSON Schema `parameters` field (not Zod),
 * so it can be registered in ToolRegistry directly.
 */
export function fromMcpTool(mcpDef: McpToolDefinition): ToolDefinition {
  return {
    name: mcpDef.name,
    description: mcpDef.description ?? "",
    parameters: mcpDef.inputSchema as Record<string, unknown>,
  };
}

/**
 * Convert a Proteus ToolDefinition to an MCP tool definition.
 * Handles both Zod schemas and plain JSON Schema objects.
 */
export function toMcpTool(tool: Tool): McpToolDefinition {
  const def = tool.definition;
  let inputSchema: JsonSchema;

  // Check if parameters is a Zod schema (has _def property)
  if (def.parameters && typeof def.parameters === "object" && "_def" in def.parameters) {
    // It's a Zod schema — convert to JSON Schema
    inputSchema = zodToJsonSchema(def.parameters as unknown as z.ZodTypeAny, {
      target: "jsonSchema7",
    }) as JsonSchema;
  } else {
    // Already a JSON Schema object
    inputSchema = def.parameters as JsonSchema;
  }

  return {
    name: def.name,
    description: def.description,
    inputSchema,
  };
}

/**
 * Convert an MCP tool call result to a Proteus ToolResult.
 */
export function fromMcpToolCallResult(mcpResult: McpToolCallResult): ToolResult {
  if (mcpResult.isError) {
    const errorText = extractText(mcpResult.content);
    return {
      output: null,
      error: { message: errorText, retryable: false },
    };
  }

  return {
    output: extractText(mcpResult.content),
  };
}

/**
 * Convert a Proteus ToolResult to an MCP tool call result.
 */
export function toMcpToolCallResult(result: ToolResult): McpToolCallResult {
  if (result.error) {
    return {
      content: [{ type: "text", text: result.error.message }],
      isError: true,
    };
  }

  const text = typeof result.output === "string"
    ? result.output
    : JSON.stringify(result.output);

  return {
    content: [{ type: "text", text }],
    isError: false,
  };
}

/** Extract text content from MCP content array. */
function extractText(content: McpContent[]): string {
  return content
    .filter((c): c is { type: "text"; text: string } => c.type === "text")
    .map((c) => c.text)
    .join("\n");
}
