import { describe, it, expect } from "vitest";
import { NoopTracer, NoopMetric } from "./noop-tracer.js";

describe("NoopTracer", () => {
  it("startSpan returns a span with valid shape", () => {
    const tracer = new NoopTracer();
    const span = tracer.startSpan("test-span");

    expect(span.name).toBe("test-span");
    expect(span.spanId).toBeDefined();
    expect(span.traceId).toBeDefined();
    expect(span.startTime).toBeGreaterThan(0);
  });

  it("span methods do not throw", () => {
    const tracer = new NoopTracer();
    const span = tracer.startSpan("test");

    expect(() => span.setAttribute("key", "value")).not.toThrow();
    expect(() => span.setAttribute("num", 42)).not.toThrow();
    expect(() => span.setAttribute("bool", true)).not.toThrow();
    expect(() => span.setStatus("ok")).not.toThrow();
    expect(() => span.setStatus("error", "failed")).not.toThrow();
    expect(() => span.end()).not.toThrow();
  });

  it("getActiveSpan returns undefined", () => {
    const tracer = new NoopTracer();
    expect(tracer.getActiveSpan()).toBeUndefined();
  });

  it("startSpan accepts parent and attributes", () => {
    const tracer = new NoopTracer();
    const parent = tracer.startSpan("parent");
    const child = tracer.startSpan("child", parent, { "key": "value" });

    expect(child.name).toBe("child");
  });
});

describe("NoopMetric", () => {
  it("incrementCounter does not throw", () => {
    const metric = new NoopMetric();
    expect(() => metric.incrementCounter("test.counter")).not.toThrow();
    expect(() => metric.incrementCounter("test.counter", 5, { "env": "test" })).not.toThrow();
  });

  it("recordHistogram does not throw", () => {
    const metric = new NoopMetric();
    expect(() => metric.recordHistogram("test.histogram", 100)).not.toThrow();
    expect(() => metric.recordHistogram("test.histogram", 100, { "env": "test" })).not.toThrow();
  });

  it("setGauge does not throw", () => {
    const metric = new NoopMetric();
    expect(() => metric.setGauge("test.gauge", 1)).not.toThrow();
    expect(() => metric.setGauge("test.gauge", -1, { "env": "test" })).not.toThrow();
  });
});
