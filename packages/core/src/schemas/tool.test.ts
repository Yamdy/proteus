import { describe, it, expect } from "vitest";
import { ToolDefinitionSchema, ToolResultSchema, ArtifactSchema } from "./tool.js";

describe("ArtifactSchema", () => {
  it("accepts valid artifact", () => {
    const result = ArtifactSchema.safeParse({ type: "file", data: "content" });
    expect(result.success).toBe(true);
  });

  it("accepts artifact with metadata", () => {
    const result = ArtifactSchema.safeParse({
      type: "image",
      data: Buffer.from("img"),
      metadata: { width: 100 },
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing type", () => {
    const result = ArtifactSchema.safeParse({ data: "x" });
    expect(result.success).toBe(false);
  });
});

describe("ToolDefinitionSchema", () => {
  it("accepts valid definition", () => {
    const result = ToolDefinitionSchema.safeParse({
      name: "search",
      description: "Search the web",
      parameters: { query: { type: "string" } },
    });
    expect(result.success).toBe(true);
  });

  it("accepts with builtin flag", () => {
    const result = ToolDefinitionSchema.safeParse({
      name: "exec",
      description: "Execute code",
      parameters: {},
      builtin: true,
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing name", () => {
    const result = ToolDefinitionSchema.safeParse({
      description: "desc",
      parameters: {},
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-object parameters", () => {
    const result = ToolDefinitionSchema.safeParse({
      name: "t",
      description: "d",
      parameters: "bad",
    });
    expect(result.success).toBe(false);
  });
});

describe("ToolResultSchema", () => {
  it("accepts minimal result", () => {
    const result = ToolResultSchema.safeParse({ output: "done" });
    expect(result.success).toBe(true);
  });

  it("accepts result with artifacts", () => {
    const result = ToolResultSchema.safeParse({
      output: "ok",
      artifacts: [{ type: "file", data: "content" }],
    });
    expect(result.success).toBe(true);
  });

  it("accepts result with error", () => {
    const result = ToolResultSchema.safeParse({
      output: null,
      error: { message: "failed", retryable: true },
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing output", () => {
    const result = ToolResultSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects error without retryable", () => {
    const result = ToolResultSchema.safeParse({
      output: null,
      error: { message: "fail" },
    });
    expect(result.success).toBe(false);
  });
});
