import { describe, it, expect, beforeEach } from "vitest";
import { z } from "zod";
import { ToolRegistry } from "./tool-registry.js";
import type { Tool, ToolDefinition, ToolResult, TurnContext } from "./index.js";

function makeTool(overrides?: Partial<ToolDefinition>): Tool {
  const def: ToolDefinition = {
    name: overrides?.name ?? "test-tool",
    description: overrides?.description ?? "A test tool",
    parameters: overrides?.parameters ?? { type: "object", properties: {} },
    builtin: overrides?.builtin,
  };
  return {
    definition: def,
    execute: async () => ({ output: "ok" }),
  };
}

describe("ToolRegistry", () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
  });

  describe("register/unregister lifecycle", () => {
    it("registers a tool and reports has() true", () => {
      const tool = makeTool({ name: "search" });
      registry.register(tool);
      expect(registry.has("search")).toBe(true);
    });

    it("has() returns false for unregistered tool", () => {
      expect(registry.has("nonexistent")).toBe(false);
    });

    it("get() returns the registered tool", () => {
      const tool = makeTool({ name: "search" });
      registry.register(tool);
      expect(registry.get("search")).toBe(tool);
    });

    it("get() returns undefined for unknown tool", () => {
      expect(registry.get("nonexistent")).toBeUndefined();
    });

    it("list() returns all registered tool names", () => {
      registry.register(makeTool({ name: "a" }));
      registry.register(makeTool({ name: "b" }));
      registry.register(makeTool({ name: "c" }));
      expect(registry.list()).toEqual(["a", "b", "c"]);
    });

    it("unregister() removes a tool", () => {
      registry.register(makeTool({ name: "search" }));
      registry.unregister("search");
      expect(registry.has("search")).toBe(false);
      expect(registry.get("search")).toBeUndefined();
    });

    it("unregister() on nonexistent tool is a no-op", () => {
      expect(() => registry.unregister("nope")).not.toThrow();
    });
  });

  describe("getDefinitions()", () => {
    it("returns ToolDefinition array from registered tools", () => {
      const tool = makeTool({
        name: "search",
        description: "Search the web",
        parameters: { type: "object", properties: { query: { type: "string" } } },
      });
      registry.register(tool);
      const defs = registry.getDefinitions();
      expect(defs).toHaveLength(1);
      expect(defs[0]!.name).toBe("search");
      expect(defs[0]!.description).toBe("Search the web");
    });

    it("derives JSON Schema from Zod schema when provided", () => {
      const zodSchema = z.object({ query: z.string().describe("Search query") });
      const tool = makeTool({ name: "search" });
      registry.register(tool, zodSchema);
      const defs = registry.getDefinitions();
      expect(defs).toHaveLength(1);
      const params = defs[0]!.parameters as any;
      expect(params.properties.query).toBeDefined();
    });
  });

  describe("execute()", () => {
    it("dispatches to tool.execute with validated params", async () => {
      let receivedParams: any;
      const tool: Tool = {
        definition: { name: "add", description: "Add numbers", parameters: {} },
        execute: async (params) => {
          receivedParams = params;
          return { output: params.a };
        },
      };
      const zodSchema = z.object({ a: z.number(), b: z.number() });
      registry.register(tool, zodSchema);

      const result = await registry.execute("add", { a: 2, b: 3 }, {} as TurnContext);
      expect(receivedParams).toEqual({ a: 2, b: 3 });
      expect(result.output).toBe(2);
    });

    it("rejects invalid params with a clear error", async () => {
      const tool = makeTool({ name: "search" });
      const zodSchema = z.object({ query: z.string() });
      registry.register(tool, zodSchema);

      await expect(
        registry.execute("search", { query: 123 }, {} as TurnContext),
      ).rejects.toThrow(/validation/i);
    });

    it("rejects missing required params", async () => {
      const tool = makeTool({ name: "search" });
      const zodSchema = z.object({ query: z.string() });
      registry.register(tool, zodSchema);

      await expect(
        registry.execute("search", {}, {} as TurnContext),
      ).rejects.toThrow(/validation/i);
    });

    it("allows execution without Zod schema (no validation)", async () => {
      const tool: Tool = {
        definition: { name: "raw", description: "Raw tool", parameters: {} },
        execute: async (params) => ({ output: params }),
      };
      registry.register(tool);

      const result = await registry.execute("raw", { anything: true }, {} as TurnContext);
      expect(result.output).toEqual({ anything: true });
    });
  });

  describe("error cases", () => {
    it("throws descriptive error for unknown tool name on execute", async () => {
      await expect(
        registry.execute("nonexistent", {}, {} as TurnContext),
      ).rejects.toThrow(/nonexistent.*not found/i);
    });

    it("throws on duplicate registration", () => {
      registry.register(makeTool({ name: "dup" }));
      expect(() => registry.register(makeTool({ name: "dup" }))).toThrow(/already registered/i);
    });
  });
});
