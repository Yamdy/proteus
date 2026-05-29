/**
 * ProteusSpan — core's own span interface.
 * OTel SDK types never appear in public exports.
 */
export interface ProteusSpan {
  readonly name: string;
  readonly spanId: string;
  readonly traceId: string;
  readonly startTime: number;
  setAttribute(key: string, value: string | number | boolean): void;
  setStatus(code: "ok" | "error", message?: string): void;
  end(): void;
}

/**
 * ProteusTracer — core's own tracer interface.
 */
export interface ProteusTracer {
  startSpan(
    name: string,
    parent?: ProteusSpan,
    attributes?: Record<string, string | number | boolean>,
  ): ProteusSpan;
  getActiveSpan(): ProteusSpan | undefined;
}

/**
 * ProteusMetric — core's own metric interface.
 */
export interface ProteusMetric {
  incrementCounter(name: string, value?: number, attributes?: Record<string, string>): void;
  recordHistogram(name: string, value: number, attributes?: Record<string, string>): void;
  setGauge(name: string, value: number, attributes?: Record<string, string>): void;
}

/**
 * OTelConfig — configuration for the OTel adapter.
 */
export interface OTelConfig {
  serviceName: string;
  endpoint?: string;
  resourceAttributes?: Record<string, string>;
  enabled?: boolean;
}

// --- OTel SDK imports (only file that imports @opentelemetry/*) ---
import { trace, metrics, context, SpanStatusCode } from "@opentelemetry/api";
import type { Span as OTelSpan, Tracer as OTelTracer } from "@opentelemetry/api";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";

class OTelSpanWrapper implements ProteusSpan {
  readonly name: string;
  readonly spanId: string;
  readonly traceId: string;
  readonly startTime: number;
  private readonly inner: OTelSpan;

  constructor(inner: OTelSpan, name: string) {
    this.inner = inner;
    this.name = name;
    const ctx = inner.spanContext();
    this.spanId = ctx.spanId;
    this.traceId = ctx.traceId;
    this.startTime = Date.now();
  }

  setAttribute(key: string, value: string | number | boolean): void { this.inner.setAttribute(key, value); }
  setStatus(code: "ok" | "error", message?: string): void {
    this.inner.setStatus({ code: code === "ok" ? SpanStatusCode.OK : SpanStatusCode.ERROR, message });
  }
  end(): void { this.inner.end(); }
  unwrap(): OTelSpan { return this.inner; }
}

export class OTelAdapter implements ProteusTracer, ProteusMetric {
  private readonly sdk: NodeSDK;
  private readonly otelTracer: OTelTracer;
  private readonly serviceName: string;
  private activeSpan: ProteusSpan | undefined;

  constructor(config: OTelConfig) {
    this.serviceName = config.serviceName;
    this.sdk = new NodeSDK({
      serviceName: config.serviceName,
      traceExporter: new OTLPTraceExporter({ url: config.endpoint ? `${config.endpoint}/v1/traces` : undefined }),
    });
    this.sdk.start();
    this.otelTracer = trace.getTracer(config.serviceName);
  }

  startSpan(name: string, parent?: ProteusSpan, attributes?: Record<string, string | number | boolean>): ProteusSpan {
    const parentCtx = parent ? trace.setSpan(context.active(), (parent as OTelSpanWrapper).unwrap()) : context.active();
    const span = this.otelTracer.startSpan(name, {}, parentCtx);
    if (attributes) for (const [k, v] of Object.entries(attributes)) span.setAttribute(k, v);
    const wrapper = new OTelSpanWrapper(span, name);
    this.activeSpan = wrapper;
    return wrapper;
  }

  getActiveSpan(): ProteusSpan | undefined { return this.activeSpan; }

  incrementCounter(name: string, value = 1, attributes?: Record<string, string>): void {
    metrics.getMeter(this.serviceName).createCounter(name).add(value, attributes);
  }
  recordHistogram(name: string, value: number, attributes?: Record<string, string>): void {
    metrics.getMeter(this.serviceName).createHistogram(name).record(value, attributes);
  }
  setGauge(name: string, value: number, attributes?: Record<string, string>): void {
    metrics.getMeter(this.serviceName).createUpDownCounter(name).add(value, attributes);
  }

  async shutdown(): Promise<void> { await this.sdk.shutdown(); }
}

export function createOTelAdapter(config: OTelConfig): OTelAdapter | undefined {
  if (config.enabled === false) return undefined;
  if (!process.env.OTEL_EXPORTER_OTLP_ENDPOINT && !config.endpoint) return undefined;
  return new OTelAdapter(config);
}
