import { describe, it, expect } from "vitest";
import { OTelAdapter, createOTelAdapter } from "./otel-adapter.js";
import type { OTelConfig } from "./otel-adapter.js";

const CFG: OTelConfig = { serviceName: "test-svc", endpoint: "http://localhost:4318" };

describe("createOTelAdapter", () => {
  it("returns undefined when enabled=false", () => {
    expect(createOTelAdapter({ ...CFG, enabled: false })).toBeUndefined();
  });

  it("returns undefined when no endpoint and no env var", () => {
    const orig = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    expect(createOTelAdapter({ serviceName: "test" })).toBeUndefined();
    if (orig) process.env.OTEL_EXPORTER_OTLP_ENDPOINT = orig;
  });

  it("returns adapter when endpoint provided", () => {
    const adapter = createOTelAdapter(CFG);
    expect(adapter).toBeDefined();
  });
});

describe("OTelAdapter", () => {
  it("startSpan returns span with valid shape", () => {
    const adapter = new OTelAdapter(CFG);
    const span = adapter.startSpan("test");

    expect(span.name).toBe("test");
    expect(span.spanId).toMatch(/^[0-9a-f]{16}$/);
    expect(span.traceId).toMatch(/^[0-9a-f]{32}$/);
    expect(span.startTime).toBeGreaterThan(0);

    span.end();
  });

  it("startSpan with parent creates child span", () => {
    const adapter = new OTelAdapter(CFG);
    const parent = adapter.startSpan("parent");
    const child = adapter.startSpan("child", parent);

    expect(child.traceId).toBe(parent.traceId);
    child.end();
    parent.end();
  });

  it("startSpan sets attributes", () => {
    const adapter = new OTelAdapter(CFG);
    const span = adapter.startSpan("test", undefined, { "key": "value", "num": 42 });

    expect(span.name).toBe("test");
    span.setAttribute("bool", true);
    span.end();
  });

  it("setStatus works for ok and error", () => {
    const adapter = new OTelAdapter(CFG);
    const span = adapter.startSpan("test");

    span.setStatus("ok");
    span.end();

    const span2 = adapter.startSpan("test2");
    span2.setStatus("error", "failed");
    span2.end();
  });

  it("getActiveSpan returns last started span", () => {
    const adapter = new OTelAdapter(CFG);
    expect(adapter.getActiveSpan()).toBeUndefined();

    const s1 = adapter.startSpan("first");
    expect(adapter.getActiveSpan()).toBe(s1);

    const s2 = adapter.startSpan("second");
    expect(adapter.getActiveSpan()).toBe(s2);

    s2.end();
    s1.end();
  });

  it("incrementCounter does not throw", () => {
    const adapter = new OTelAdapter(CFG);
    expect(() => adapter.incrementCounter("test.counter", 1, { "env": "test" })).not.toThrow();
  });

  it("recordHistogram does not throw", () => {
    const adapter = new OTelAdapter(CFG);
    expect(() => adapter.recordHistogram("test.histogram", 100, { "env": "test" })).not.toThrow();
  });

  it("setGauge does not throw", () => {
    const adapter = new OTelAdapter(CFG);
    expect(() => adapter.setGauge("test.gauge", 1, { "env": "test" })).not.toThrow();
  });

  it("shutdown does not throw", async () => {
    const adapter = new OTelAdapter(CFG);
    await expect(adapter.shutdown()).resolves.toBeUndefined();
  });
});
