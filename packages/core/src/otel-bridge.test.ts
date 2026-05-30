import { describe, it, expect, vi, beforeEach } from "vitest";
import { OTelBridgeHandler, createOTelBridgeHandlers, registerOTelBridge } from "./otel-bridge.js";
import { NoopTracer, NoopMetric } from "./noop-tracer.js";
import { HandlerEngine } from "./handler-engine.js";
import type { ProteusSpan, ProteusTracer, ProteusMetric } from "./otel-adapter.js";

// --- Mock helpers ---
function mockSpan(name: string): ProteusSpan {
  return {
    name, spanId: "s1", traceId: "t1", startTime: Date.now(),
    setAttribute: vi.fn(), setStatus: vi.fn(), end: vi.fn(),
  };
}

function mockTracer(): ProteusTracer & { spans: ProteusSpan[] } {
  const spans: ProteusSpan[] = [];
  return {
    spans,
    startSpan(name, _parent, attrs) {
      const span = mockSpan(name);
      if (attrs) Object.entries(attrs).forEach(([k, v]) => span.setAttribute(k, v));
      spans.push(span);
      return span;
    },
    getActiveSpan() { return spans.at(-1); },
  };
}

function mockMetric(): ProteusMetric & { calls: any[] } {
  const calls: any[] = [];
  return {
    calls,
    incrementCounter: (n, v = 1, a) => calls.push({ t: "c", n, v, a }),
    recordHistogram: (n, v, a) => calls.push({ t: "h", n, v, a }),
    setGauge: (n, v, a) => calls.push({ t: "g", n, v, a }),
  };
}

// --- Tests ---
describe("OTelBridgeHandler", () => {
  let tracer: ReturnType<typeof mockTracer>;
  let metric: ReturnType<typeof mockMetric>;
  let bridge: OTelBridgeHandler;

  beforeEach(() => {
    tracer = mockTracer();
    metric = mockMetric();
    bridge = new OTelBridgeHandler(tracer, metric);
  });

  describe("chain lifecycle", () => {
    it("chain:start creates root span with attributes", () => {
      bridge.handleChainStart({ chainId: "c1", sessionId: "s1" });
      expect(tracer.spans).toHaveLength(1);
      expect(tracer.spans[0].name).toBe("chain");
      expect(tracer.spans[0].setAttribute).toHaveBeenCalledWith("chain.id", "c1");
      expect(tracer.spans[0].setAttribute).toHaveBeenCalledWith("session.id", "s1");
    });

    it("chain:end ends span with ok status", () => {
      bridge.handleChainStart({ chainId: "c1", sessionId: "s1" });
      bridge.handleChainEnd({ chainId: "c1", sessionId: "s1", status: "completed", turns: 3 });
      expect(tracer.spans[0].end).toHaveBeenCalled();
      expect(tracer.spans[0].setStatus).toHaveBeenCalledWith("ok");
    });

    it("chain:end with errored sets error status", () => {
      bridge.handleChainStart({ chainId: "c1", sessionId: "s1" });
      bridge.handleChainEnd({ chainId: "c1", sessionId: "s1", status: "errored", turns: 1 });
      expect(tracer.spans[0].setStatus).toHaveBeenCalledWith("error");
    });

    it("chain:start increments chain.active gauge", () => {
      bridge.handleChainStart({ chainId: "c1", sessionId: "s1" });
      expect(metric.calls).toContainEqual({ t: "g", n: "proteus.chain.active", v: 1, a: { session_id: "s1" } });
    });

    it("chain:end decrements chain.active gauge", () => {
      bridge.handleChainStart({ chainId: "c1", sessionId: "s1" });
      bridge.handleChainEnd({ chainId: "c1", sessionId: "s1", status: "completed", turns: 1 });
      expect(metric.calls).toContainEqual({ t: "g", n: "proteus.chain.active", v: -1, a: { session_id: "s1" } });
    });
  });

  describe("turn lifecycle", () => {
    it("turn:start creates child span under chain", () => {
      bridge.handleChainStart({ chainId: "c1", sessionId: "s1" });
      bridge.handleTurnStart({ turnId: "t1", sessionId: "s1" });
      expect(tracer.spans).toHaveLength(2);
      expect(tracer.spans[1].name).toBe("turn");
    });

    it("turn:end ends span and records metrics", () => {
      bridge.handleChainStart({ chainId: "c1", sessionId: "s1" });
      bridge.handleTurnStart({ turnId: "t1", sessionId: "s1" });
      bridge.handleTurnEnd({ turnId: "t1", status: "completed" });
      expect(tracer.spans[1].end).toHaveBeenCalled();
      expect(metric.calls).toContainEqual(expect.objectContaining({ n: "proteus.turn.total" }));
      expect(metric.calls).toContainEqual(expect.objectContaining({ n: "proteus.turn.duration" }));
    });

    it("turn:end with error records error attributes", () => {
      bridge.handleChainStart({ chainId: "c1", sessionId: "s1" });
      bridge.handleTurnStart({ turnId: "t1", sessionId: "s1" });
      const error = new Error("LLM failed");
      bridge.handleTurnEnd({ turnId: "t1", status: "errored", error });
      expect(tracer.spans[1].setStatus).toHaveBeenCalledWith("error", "LLM failed");
    });
  });

  describe("concurrent sessions", () => {
    it("sessions maintain independent span stacks", () => {
      bridge.handleChainStart({ chainId: "c1", sessionId: "s1" });
      bridge.handleChainStart({ chainId: "c2", sessionId: "s2" });
      expect(tracer.spans).toHaveLength(2);
      expect(tracer.spans[0].setAttribute).toHaveBeenCalledWith("chain.id", "c1");
      expect(tracer.spans[1].setAttribute).toHaveBeenCalledWith("chain.id", "c2");
    });

    it("handleTurnEnd with sessionId closes correct session's turn span", () => {
      // Setup two concurrent sessions with active turns
      bridge.handleChainStart({ chainId: "c1", sessionId: "s1" });
      bridge.handleChainStart({ chainId: "c2", sessionId: "s2" });
      bridge.handleTurnStart({ turnId: "t1", sessionId: "s1" });
      bridge.handleTurnStart({ turnId: "t2", sessionId: "s2" });

      // spans: [0]=s1 chain, [1]=s2 chain, [2]=s1 turn, [3]=s2 turn
      const s1TurnSpan = tracer.spans[2]; // s1's turn span
      const s2TurnSpan = tracer.spans[3]; // s2's turn span

      // End s1's turn with explicit sessionId
      bridge.handleTurnEnd({ turnId: "t1", sessionId: "s1", status: "completed" });

      // s1's turn span should be ended
      expect(s1TurnSpan.end).toHaveBeenCalled();
      // s2's turn span should NOT be ended
      expect(s2TurnSpan.end).not.toHaveBeenCalled();
    });

    it("handleTurnEnd without sessionId falls back to findActiveTurnStack (backward compat)", () => {
      bridge.handleChainStart({ chainId: "c1", sessionId: "s1" });
      bridge.handleTurnStart({ turnId: "t1", sessionId: "s1" });

      const turnSpan = tracer.spans[1];

      // End turn without sessionId (old behavior)
      bridge.handleTurnEnd({ turnId: "t1", status: "completed" });

      // Should still work for single-session scenario
      expect(turnSpan.end).toHaveBeenCalled();
    });

    it("metrics for turn:end use the correct session's turnStartTime", () => {
      bridge.handleChainStart({ chainId: "c1", sessionId: "s1" });
      bridge.handleChainStart({ chainId: "c2", sessionId: "s2" });
      bridge.handleTurnStart({ turnId: "t1", sessionId: "s1" });
      bridge.handleTurnStart({ turnId: "t2", sessionId: "s2" });

      // End s1's turn with explicit sessionId
      bridge.handleTurnEnd({ turnId: "t1", sessionId: "s1", status: "completed" });

      // Should have recorded duration metric
      const durationMetrics = metric.calls.filter(c => c.n === "proteus.turn.duration");
      expect(durationMetrics).toHaveLength(1);
      expect(durationMetrics[0].a).toEqual({ status: "completed" });
    });
  });
});

describe("createOTelBridgeHandlers", () => {
  it("returns 6 handlers covering all events", () => {
    const handlers = createOTelBridgeHandlers(mockTracer(), mockMetric());
    expect(handlers).toHaveLength(6);
    const events = handlers.flatMap(h => h.events ?? []);
    expect(events).toContain("chain:start");
    expect(events).toContain("chain:end");
    expect(events).toContain("turn:start");
    expect(events).toContain("turn:end");
    expect(events).toContain("phase:before");
    expect(events).toContain("phase:after");
  });

  it("all handlers have priority 30 and trust 3", () => {
    const handlers = createOTelBridgeHandlers(mockTracer(), mockMetric());
    handlers.forEach(h => {
      expect(h.priority).toBe(30);
      expect(h.trust).toBe(3);
      expect(h.builtin).toBe(true);
    });
  });
});

describe("registerOTelBridge", () => {
  it("registers 6 handlers on engine", () => {
    const engine = new HandlerEngine();
    registerOTelBridge(engine, mockTracer(), mockMetric());
    const otel = engine.serialize().handlers.filter(h => h.name.startsWith("otel-bridge"));
    expect(otel).toHaveLength(6);
  });
});

describe("NoopTracer integration", () => {
  it("bridge works with noop implementations", () => {
    const bridge = new OTelBridgeHandler(new NoopTracer(), new NoopMetric());
    bridge.handleChainStart({ chainId: "c1", sessionId: "s1" });
    bridge.handleTurnStart({ turnId: "t1", sessionId: "s1" });
    bridge.handlePhaseBefore({ phaseName: "llm_inference", session: { sessionId: "s1" }, turn: { turnId: "t1" } });
    bridge.handlePhaseAfter({ phaseName: "llm_inference", session: { sessionId: "s1" }, turn: { turnId: "t1" } });
    bridge.handleTurnEnd({ turnId: "t1", status: "completed" });
    bridge.handleChainEnd({ chainId: "c1", sessionId: "s1", status: "completed", turns: 1 });
  });
});
