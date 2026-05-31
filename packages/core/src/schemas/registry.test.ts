import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createSchemaRegistry } from "./registry.js";

describe("SchemaRegistry", () => {
  it("creates with built-in schemas", () => {
    const registry = createSchemaRegistry();
    expect(registry.has("ToolDefinition")).toBe(true);
    expect(registry.has("ToolResult")).toBe(true);
    expect(registry.has("HandlerResult")).toBe(true);
    expect(registry.has("SessionConfig")).toBe(true);
  });

  it("registers all 7 built-in schemas", () => {
    const registry = createSchemaRegistry();
    const names = registry.list();
    expect(names).toHaveLength(7);
    expect(names).toContain("ToolDefinition");
    expect(names).toContain("ToolResult");
    expect(names).toContain("HandlerResult");
    expect(names).toContain("SessionConfig");
    expect(names).toContain("Artifact");
    expect(names).toContain("ToolCall");
    expect(names).toContain("LLMResponse");
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

  describe("toJSONSchema", () => {
    it("converts a registered schema to JSON Schema", () => {
      const registry = createSchemaRegistry();
      const jsonSchema = registry.toJSONSchema("ToolDefinition");
      expect(jsonSchema).toBeDefined();
      expect(jsonSchema).toHaveProperty("type", "object");
      expect(jsonSchema).toHaveProperty("properties");
      const props = jsonSchema.properties as Record<string, unknown>;
      expect(props).toHaveProperty("name");
      expect(props).toHaveProperty("description");
      expect(props).toHaveProperty("parameters");
    });

    it("throws for unknown schema name", () => {
      const registry = createSchemaRegistry();
      expect(() => registry.toJSONSchema("NonExistent")).toThrow("not found");
    });

    it("passes options through to zodToJsonSchema", () => {
      const registry = createSchemaRegistry();
      const jsonSchema = registry.toJSONSchema("ToolDefinition", {
        target: "jsonSchema2019-09",
      });
      expect(jsonSchema).toHaveProperty(
        "$schema",
        "https://json-schema.org/draft/2019-09/schema#"
      );
    });
  });

  describe("production bypass", () => {
    const originalEnv = process.env.NODE_ENV;

    beforeEach(() => {
      vi.stubEnv("NODE_ENV", "production");
    });

    afterEach(() => {
      process.env.NODE_ENV = originalEnv;
      vi.unstubAllEnvs();
    });

    it("skips validation and returns success in production", () => {
      const registry = createSchemaRegistry();
      const result = registry.validate("ToolDefinition", {
        totally: "invalid",
      });
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ totally: "invalid" });
      expect(result.errors).toBeUndefined();
    });

    it("bypasses unknown schema check in production", () => {
      const registry = createSchemaRegistry();
      const result = registry.validate("NonExistent", { foo: "bar" });
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ foo: "bar" });
    });
  });
});
