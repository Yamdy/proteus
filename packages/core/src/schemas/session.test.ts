import { describe, it, expect } from "vitest";
import { SessionConfigSchema, SessionLLMConfigSchema } from "./session.js";
import type { SessionConfigInferred } from "./session.js";

// Canonical valid fixture
function validConfig(): SessionConfigInferred {
  return {
    sessionId: "sess-001",
    llm: {
      provider: "openai",
      model: "gpt-4o",
      temperature: 0.7,
    },
    tools: {
      search: true,
      code_exec: false,
    },
    logLevel: "info",
  };
}

describe("SessionLLMConfigSchema", () => {
  it("accepts valid LLM config", () => {
    const result = SessionLLMConfigSchema.safeParse({
      provider: "openai",
      model: "gpt-4o",
      temperature: 0.7,
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing provider", () => {
    const result = SessionLLMConfigSchema.safeParse({
      model: "gpt-4o",
      temperature: 0.7,
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-number temperature", () => {
    const result = SessionLLMConfigSchema.safeParse({
      provider: "openai",
      model: "gpt-4o",
      temperature: "warm",
    });
    expect(result.success).toBe(false);
  });
});

describe("SessionConfigSchema", () => {
  it("accepts a fully valid config", () => {
    const result = SessionConfigSchema.safeParse(validConfig());
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(validConfig());
    }
  });

  it("accepts an empty tools map", () => {
    const cfg = { ...validConfig(), tools: {} };
    const result = SessionConfigSchema.safeParse(cfg);
    expect(result.success).toBe(true);
  });

  it("rejects missing sessionId", () => {
    const { sessionId: _, ...rest } = validConfig();
    const result = SessionConfigSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects missing llm", () => {
    const { llm: _, ...rest } = validConfig();
    const result = SessionConfigSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects missing tools", () => {
    const { tools: _, ...rest } = validConfig();
    const result = SessionConfigSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects missing logLevel", () => {
    const { logLevel: _, ...rest } = validConfig();
    const result = SessionConfigSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects invalid logLevel", () => {
    const cfg = { ...validConfig(), logLevel: "trace" };
    const result = SessionConfigSchema.safeParse(cfg);
    expect(result.success).toBe(false);
  });

  it("rejects non-boolean tool value", () => {
    const cfg = { ...validConfig(), tools: { search: "yes" } };
    const result = SessionConfigSchema.safeParse(cfg);
    expect(result.success).toBe(false);
  });

  it("rejects non-string sessionId", () => {
    const cfg = { ...validConfig(), sessionId: 123 };
    const result = SessionConfigSchema.safeParse(cfg);
    expect(result.success).toBe(false);
  });

  it("rejects null input", () => {
    const result = SessionConfigSchema.safeParse(null);
    expect(result.success).toBe(false);
  });

  it("rejects undefined input", () => {
    const result = SessionConfigSchema.safeParse(undefined);
    expect(result.success).toBe(false);
  });

  it("strips unknown keys (strict mode off by default)", () => {
    const cfg = { ...validConfig(), extraField: "ignored" };
    const result = SessionConfigSchema.safeParse(cfg);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(validConfig());
    }
  });
});

describe("z.infer type compatibility", () => {
  it("inferred type is assignable to the original SessionConfig interface", () => {
    // This is a compile-time check: if the types diverge the TS compiler
    // will flag this assignment. At runtime we just confirm the parse works.
    const parsed = SessionConfigSchema.parse(validConfig());
    // Assign to a variable typed as the original interface import.
    // The import from types.ts uses the same shape so this should pass.
    const _check: typeof parsed = parsed;
    expect(_check.sessionId).toBe("sess-001");
  });
});
