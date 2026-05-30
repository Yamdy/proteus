import { describe, it, expect } from "vitest";
import { createSchemaRegistry } from "./registry.js";

describe("SchemaRegistry", () => {
  it("creates with built-in schemas", () => {
    const registry = createSchemaRegistry();
    expect(registry.has("ToolDefinition")).toBe(true);
    expect(registry.has("ToolResult")).toBe(true);
    expect(registry.has("HandlerResult")).toBe(true);
    expect(registry.has("SessionConfig")).toBe(true);
  });

  it("lists all registered schemas", () => {
    const registry = createSchemaRegistry();
    const names = registry.list();
    expect(names).toContain("ToolDefinition");
    expect(names).toContain("ToolResult");
    expect(names).toContain("HandlerResult");
    expect(names).toContain("SessionConfig");
  });

  it("registers custom schema", () => {
    const registry = createSchemaRegistry();
    const customSchema = { parse: () => ({}) } as any;
    registry.register("Custom", customSchema);
    expect(registry.has("Custom")).toBe(true);
  });

  it("validates ToolDefinition successfully", () => {
    const registry = createSchemaRegistry();
    const result = registry.validate("ToolDefinition", {
      name: "search",
      description: "Search",
      parameters: {},
    });
    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
  });

  it("validates ToolDefinition failure", () => {
    const registry = createSchemaRegistry();
    const result = registry.validate("ToolDefinition", {
      name: 123,
    });
    expect(result.success).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors!.length).toBeGreaterThan(0);
  });

  it("validateOrThrow throws on invalid data", () => {
    const registry = createSchemaRegistry();
    expect(() => registry.validateOrThrow("ToolDefinition", {})).toThrow();
  });

  it("validateOrThrow returns data on valid input", () => {
    const registry = createSchemaRegistry();
    const data = registry.validateOrThrow("ToolDefinition", {
      name: "t",
      description: "d",
      parameters: {},
    });
    expect(data).toEqual({ name: "t", description: "d", parameters: {} });
  });

  it("returns error for unknown schema", () => {
    const registry = createSchemaRegistry();
    const result = registry.validate("NonExistent", {});
    expect(result.success).toBe(false);
    expect(result.errors![0].message).toContain("not found");
  });

  it("validateOrThrow throws for unknown schema", () => {
    const registry = createSchemaRegistry();
    expect(() => registry.validateOrThrow("NonExistent", {})).toThrow("not found");
  });

  it("get returns schema or undefined", () => {
    const registry = createSchemaRegistry();
    expect(registry.get("ToolDefinition")).toBeDefined();
    expect(registry.get("NonExistent")).toBeUndefined();
  });
});
