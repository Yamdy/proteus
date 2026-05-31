import { describe, it, expect } from "vitest";
import { HandlerResultSchema, type InferredHandlerResult } from "./handler.js";
import type { HandlerResult } from "../types.js";

describe("HandlerResultSchema", () => {
  it("validates ok: true variant", () => {
    const result = HandlerResultSchema.parse({ ok: true });
    expect(result).toEqual({ ok: true });
  });

  it("validates ok: true with value and transform", () => {
    const result = HandlerResultSchema.parse({
      ok: true,
      value: "some value",
      transform: true,
    });
    expect(result).toEqual({ ok: true, value: "some value", transform: true });
  });

  it("validates ok: false variant", () => {
    const result = HandlerResultSchema.parse({
      ok: false,
      reason: "something went wrong",
    });
    expect(result).toEqual({ ok: false, reason: "something went wrong" });
  });

  it("validates abort variant", () => {
    const result = HandlerResultSchema.parse({
      abort: true,
      reason: "user requested abort",
    });
    expect(result).toEqual({ abort: true, reason: "user requested abort" });
  });

  it("validates abort with retryFrom", () => {
    const result = HandlerResultSchema.parse({
      abort: true,
      reason: "retry from step 2",
      retryFrom: 2,
    });
    expect(result).toEqual({
      abort: true,
      reason: "retry from step 2",
      retryFrom: 2,
    });
  });

  it("validates suspend variant", () => {
    const result = HandlerResultSchema.parse({
      suspend: true,
    });
    expect(result).toEqual({ suspend: true });
  });

  it("validates suspend with pendingInput", () => {
    const result = HandlerResultSchema.parse({
      suspend: true,
      pendingInput: { question: "approve?" },
    });
    expect(result).toEqual({
      suspend: true,
      pendingInput: { question: "approve?" },
    });
  });

  it("validates error variant", () => {
    const err = { message: "test error", name: "Error" };
    const result = HandlerResultSchema.parse({
      error: err,
      recoverable: true,
    });
    expect(result).toEqual({ error: err, recoverable: true });
  });

  it("validates error variant without recoverable", () => {
    const err = { message: "fatal", name: "Error" };
    const result = HandlerResultSchema.parse({ error: err });
    expect(result).toEqual({ error: err });
  });

  it("rejects invalid data", () => {
    expect(() => HandlerResultSchema.parse({})).toThrow();
    expect(() => HandlerResultSchema.parse({ ok: "yes" })).toThrow();
    expect(() => HandlerResultSchema.parse({ abort: true })).toThrow(); // missing reason
  });

  it("rejects non-object", () => {
    expect(() => HandlerResultSchema.parse("string")).toThrow();
    expect(() => HandlerResultSchema.parse(42)).toThrow();
    expect(() => HandlerResultSchema.parse(null)).toThrow();
  });
});

// Type-level check (compile-time only)
// @ts-expect-error — used only for type checking
type _HandlerCheck = InferredHandlerResult extends HandlerResult ? true : never;
