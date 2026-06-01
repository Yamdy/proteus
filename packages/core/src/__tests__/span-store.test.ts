import { describe, it, expect, beforeEach } from "vitest";
import { InMemorySpanStore } from "../in-memory-span-store.js";
import type { SpanStore, SpanRecord } from "../span-store.js";

// --- Helpers ---

function makeSpan(overrides?: Partial<SpanRecord>): SpanRecord {
  return {
    traceId: "trace-1",
    spanId: "span-1",
    name: "root-span",
    type: "chain",
    startTime: 1000,
    status: "success",
    ...overrides,
  };
}

function makeChildSpan(overrides?: Partial<SpanRecord>): SpanRecord {
  return {
    traceId: "trace-1",
    spanId: "span-2",
    parentSpanId: "span-1",
    name: "child-span",
    type: "turn",
    startTime: 1100,
    endTime: 1500,
    status: "success",
    ...overrides,
  };
}

// --- Tests ---

describe("InMemorySpanStore — SpanStore interface", () => {
  let store: SpanStore;

  beforeEach(() => {
    store = new InMemorySpanStore();
  });

  // --- addSpan + getTraceSpans round-trip ---

  describe("addSpan + getTraceSpans", () => {
    it("stores a span that can be retrieved by traceId", () => {
      store.addSpan(makeSpan());

      const spans = store.getTraceSpans("trace-1");
      expect(spans).toHaveLength(1);
      expect(spans[0].spanId).toBe("span-1");
      expect(spans[0].traceId).toBe("trace-1");
    });

    it("returns multiple spans for the same trace", () => {
      store.addSpan(makeSpan());
      store.addSpan(makeChildSpan());

      const spans = store.getTraceSpans("trace-1");
      expect(spans).toHaveLength(2);
      expect(spans.map((s) => s.spanId).sort()).toEqual(["span-1", "span-2"]);
    });

    it("returns empty array for a missing traceId", () => {
      expect(store.getTraceSpans("missing")).toEqual([]);
    });

    it("does not mix spans from different traces", () => {
      store.addSpan(makeSpan({ traceId: "trace-1", spanId: "s1" }));
      store.addSpan(makeSpan({ traceId: "trace-2", spanId: "s2" }));

      expect(store.getTraceSpans("trace-1")).toHaveLength(1);
      expect(store.getTraceSpans("trace-1")[0].spanId).toBe("s1");
      expect(store.getTraceSpans("trace-2")).toHaveLength(1);
      expect(store.getTraceSpans("trace-2")[0].spanId).toBe("s2");
    });

    it("preserves all span fields", () => {
      const span = makeSpan({
        parentSpanId: "parent-1",
        input: { prompt: "hello" },
        output: { text: "world" },
        metadata: { key: "value" },
        attributes: { env: "test" },
        tokenUsage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
      });
      store.addSpan(span);

      const loaded = store.getTraceSpans("trace-1")[0];
      expect(loaded.input).toEqual({ prompt: "hello" });
      expect(loaded.output).toEqual({ text: "world" });
      expect(loaded.metadata).toEqual({ key: "value" });
      expect(loaded.attributes).toEqual({ env: "test" });
      expect(loaded.tokenUsage).toEqual({ inputTokens: 100, outputTokens: 50, totalTokens: 150 });
    });
  });

  // --- listTraces ---

  describe("listTraces", () => {
    function addMultipleTraces() {
      // trace-1: chain root, success
      store.addSpan(makeSpan({ traceId: "trace-1", spanId: "s1", name: "chain-a", type: "chain", startTime: 1000, endTime: 2000, status: "success" }));
      store.addSpan(makeChildSpan({ traceId: "trace-1", spanId: "s1-child", parentSpanId: "s1", name: "turn-a", type: "turn", startTime: 1100, endTime: 1500 }));

      // trace-2: chain root, error
      store.addSpan(makeSpan({ traceId: "trace-2", spanId: "s2", name: "chain-b", type: "chain", startTime: 3000, endTime: 4000, status: "error" }));

      // trace-3: chain root, running
      store.addSpan(makeSpan({ traceId: "trace-3", spanId: "s3", name: "chain-c", type: "chain", startTime: 5000, status: "running" }));

      // trace-4: turn root (not chain)
      store.addSpan(makeSpan({ traceId: "trace-4", spanId: "s4", name: "turn-x", type: "turn", startTime: 6000, endTime: 7000, status: "success" }));
    }

    it("returns all traces with default pagination", () => {
      addMultipleTraces();

      const result = store.listTraces({});
      expect(result.data).toHaveLength(4);
      expect(result.total).toBe(4);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(25);
      expect(result.hasMore).toBe(false);
    });

    it("returns empty paginated response for empty store", () => {
      const result = store.listTraces({});
      expect(result.data).toEqual([]);
      expect(result.total).toBe(0);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(25);
      expect(result.hasMore).toBe(false);
    });

    // --- Pagination ---

    describe("pagination", () => {
      it("respects limit parameter", () => {
        addMultipleTraces();

        const result = store.listTraces({ limit: 2 });
        expect(result.data).toHaveLength(2);
        expect(result.total).toBe(4);
        expect(result.hasMore).toBe(true);
      });

      it("respects page parameter", () => {
        addMultipleTraces();

        const page1 = store.listTraces({ limit: 2, page: 1 });
        expect(page1.data).toHaveLength(2);
        expect(page1.hasMore).toBe(true);

        const page2 = store.listTraces({ limit: 2, page: 2 });
        expect(page2.data).toHaveLength(2);
        expect(page2.hasMore).toBe(false);
      });

      it("returns empty data when page exceeds total", () => {
        addMultipleTraces();

        const result = store.listTraces({ limit: 2, page: 10 });
        expect(result.data).toEqual([]);
        expect(result.total).toBe(4);
        expect(result.hasMore).toBe(false);
      });
    });

    // --- Filtering ---

    describe("filtering", () => {
      it("filters by status", () => {
        addMultipleTraces();

        const result = store.listTraces({ status: "error" });
        expect(result.data).toHaveLength(1);
        expect(result.data[0].traceId).toBe("trace-2");
      });

      it("filters by rootEntityType", () => {
        addMultipleTraces();

        const result = store.listTraces({ rootEntityType: "chain" });
        expect(result.data).toHaveLength(3);
      });

      it("filters by entityName", () => {
        addMultipleTraces();

        const result = store.listTraces({ entityName: "chain-a" });
        expect(result.data).toHaveLength(1);
        expect(result.data[0].traceId).toBe("trace-1");
      });

      it("combines multiple filters", () => {
        addMultipleTraces();

        const result = store.listTraces({ status: "success", rootEntityType: "chain" });
        expect(result.data).toHaveLength(1);
        expect(result.data[0].traceId).toBe("trace-1");
      });
    });

    // --- TraceSummary derivation ---

    describe("TraceSummary derivation", () => {
      it("derives TraceSummary from root span (no parentSpanId)", () => {
        store.addSpan(makeSpan({ traceId: "t1", spanId: "root", name: "my-chain", type: "chain", startTime: 1000, endTime: 2000, status: "success" }));
        store.addSpan(makeChildSpan({ traceId: "t1", spanId: "child", parentSpanId: "root" }));

        const result = store.listTraces({});
        expect(result.data).toHaveLength(1);
        const summary = result.data[0];
        expect(summary.traceId).toBe("t1");
        expect(summary.name).toBe("my-chain");
        expect(summary.type).toBe("chain");
        expect(summary.status).toBe("success");
        expect(summary.startTime).toBe(1000);
        expect(summary.endTime).toBe(2000);
        expect(summary.latency).toBe(1000);
      });

      it("sets latency to undefined when endTime is missing", () => {
        store.addSpan(makeSpan({ traceId: "t1", spanId: "root", startTime: 1000, status: "running" }));

        const result = store.listTraces({});
        expect(result.data[0].latency).toBeUndefined();
        expect(result.data[0].endTime).toBeUndefined();
      });
    });
  });

  // --- Delta mode ---

  describe("listTraces delta mode", () => {
    it("returns traces with startTime > since cursor", () => {
      store.addSpan(makeSpan({ traceId: "t1", spanId: "s1", startTime: 1000 }));
      store.addSpan(makeSpan({ traceId: "t2", spanId: "s2", startTime: 3000 }));
      store.addSpan(makeSpan({ traceId: "t3", spanId: "s3", startTime: 5000 }));

      const result = store.listTraces({ mode: "delta", since: 2000 });
      expect(result.data).toHaveLength(2);
      expect(result.data.map((t) => t.traceId).sort()).toEqual(["t2", "t3"]);
    });

    it("returns empty when no traces are newer than since", () => {
      store.addSpan(makeSpan({ traceId: "t1", spanId: "s1", startTime: 1000 }));

      const result = store.listTraces({ mode: "delta", since: 5000 });
      expect(result.data).toEqual([]);
    });

    it("ignores since when mode is not delta", () => {
      store.addSpan(makeSpan({ traceId: "t1", spanId: "s1", startTime: 1000 }));

      const result = store.listTraces({ since: 5000 });
      expect(result.data).toHaveLength(1);
    });
  });

  // --- getTraceSummary ---

  describe("getTraceSummary", () => {
    it("returns summary for an existing trace", () => {
      store.addSpan(makeSpan({ traceId: "t1", spanId: "root", name: "my-trace", type: "chain", startTime: 1000, endTime: 2000, status: "success" }));
      store.addSpan(makeChildSpan({ traceId: "t1", spanId: "child", parentSpanId: "root" }));

      const summary = store.getTraceSummary("t1");
      expect(summary).not.toBeNull();
      expect(summary!.traceId).toBe("t1");
      expect(summary!.name).toBe("my-trace");
      expect(summary!.type).toBe("chain");
      expect(summary!.status).toBe("success");
      expect(summary!.startTime).toBe(1000);
      expect(summary!.endTime).toBe(2000);
      expect(summary!.latency).toBe(1000);
    });

    it("returns null for a missing traceId", () => {
      expect(store.getTraceSummary("missing")).toBeNull();
    });

    it("returns summary even for a single span trace", () => {
      store.addSpan(makeSpan({ traceId: "t1", spanId: "only", name: "solo", type: "turn", startTime: 500 }));

      const summary = store.getTraceSummary("t1");
      expect(summary).not.toBeNull();
      expect(summary!.name).toBe("solo");
      expect(summary!.latency).toBeUndefined();
    });
  });
});
