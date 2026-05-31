/**
 * Lightweight API mock server for Studio E2E tests.
 *
 * Starts on port 3000 (same port the Vite dev-server proxy targets)
 * so tests do not need a real Proteus backend.
 *
 * Usage:
 *   import { startMockServer, stopMockServer } from "./mock-server";
 *   test.beforeAll(() => startMockServer());
 *   test.afterAll(() => stopMockServer());
 */

import http from "node:http";

type Handler = (
  req: http.IncomingMessage,
  res: http.ServerResponse,
) => void | Promise<void>;

const routes: Map<string, Handler> = new Map();

// ---------------------------------------------------------------------------
// Default mock data
// ---------------------------------------------------------------------------

const mockSessions = [
  {
    id: "sess-1",
    name: "Test Session",
    createdAt: Date.now(),
  },
  {
    id: "sess-2",
    name: "Another Session",
    createdAt: Date.now() - 86400000,
  },
];

const mockConfig = {
  level0: {
    llm: {
      provider: "anthropic",
      model: "claude-3-sonnet",
      temperature: 0.7,
    },
    tools: [
      { name: "search", enabled: true, description: "Web search tool" },
      { name: "calculator", enabled: false, description: "Math calculator" },
    ],
    logLevel: "info",
  },
  level1: {
    handlers: [
      {
        id: "h-1",
        name: "Context Builder",
        priority: 1,
        enabled: true,
        description: "Assembles context for LLM",
      },
      {
        id: "h-2",
        name: "LLM Caller",
        priority: 2,
        enabled: true,
        description: "Calls the LLM API",
      },
      {
        id: "h-3",
        name: "Tool Executor",
        priority: 3,
        enabled: true,
        description: "Executes tool calls",
      },
    ],
  },
  level2: {
    code: 'export default function handler(ctx) {\n  return ctx;\n}',
    language: "typescript",
  },
};

const mockSelfModifyHistory = [
  {
    commitId: "abc1234def5678",
    message: "Added search handler",
    timestamp: Date.now() - 3600000,
    action: "register",
    handlerName: "search",
    traceId: "trace-001",
  },
  {
    commitId: "def5678abc1234",
    message: "Updated calculator config",
    timestamp: Date.now() - 7200000,
    action: "replace",
    handlerName: "calculator",
    traceId: "trace-002",
  },
];

const mockSelfModifyDetail = {
  commitId: "abc1234def5678",
  message: "Added search handler",
  timestamp: Date.now() - 3600000,
  action: "register",
  handlerName: "search",
  traceId: "trace-001",
  diff: {
    before: "// No previous state",
    after: 'export function search(query) {\n  return fetch(`/api/search?q=${query}`);\n}',
  },
};

const mockTraces = [
  {
    traceId: "trace-001",
    sessionId: "sess-1",
    startTime: Date.now() - 60000,
    endTime: Date.now() - 55000,
    duration: 5000,
    status: "ok",
    spans: [
      {
        id: "span-1",
        traceId: "trace-001",
        name: "context_assembly",
        startTime: Date.now() - 60000,
        endTime: Date.now() - 58000,
        duration: 2000,
        status: "ok",
      },
      {
        id: "span-2",
        traceId: "trace-001",
        name: "llm_inference",
        startTime: Date.now() - 58000,
        endTime: Date.now() - 55000,
        duration: 3000,
        status: "ok",
      },
    ],
  },
  {
    traceId: "trace-002",
    sessionId: "sess-1",
    startTime: Date.now() - 30000,
    status: "error",
    spans: [
      {
        id: "span-3",
        traceId: "trace-002",
        name: "tool_execution",
        startTime: Date.now() - 30000,
        duration: 1500,
        status: "error",
        attributes: { error: "Tool timeout" },
      },
    ],
  },
];

const mockToolCalls = [
  {
    id: "tc-1",
    traceId: "trace-001",
    toolName: "search",
    startTime: Date.now() - 57000,
    endTime: Date.now() - 56000,
    duration: 1000,
    status: "ok",
    parameters: { query: "test query" },
    result: { items: ["result1", "result2"] },
  },
  {
    id: "tc-2",
    traceId: "trace-001",
    toolName: "calculator",
    startTime: Date.now() - 55500,
    endTime: Date.now() - 55000,
    duration: 500,
    status: "ok",
    parameters: { expression: "2+2" },
    result: 4,
  },
];

const mockCosts = {
  totalCostUsd: 0.35,
  totalTokens: 42000,
  bySession: [
    { sessionId: "sess-1", costUsd: 0.2, tokens: 25000 },
    { sessionId: "sess-2", costUsd: 0.15, tokens: 17000 },
  ],
  byModel: [
    { model: "claude-3-sonnet", costUsd: 0.25, tokens: 30000 },
    { model: "claude-3-haiku", costUsd: 0.1, tokens: 12000 },
  ],
  byTurn: [
    {
      id: "turn-1",
      sessionId: "sess-1",
      timestamp: Date.now() - 60000,
      model: "claude-3-sonnet",
      promptTokens: 1500,
      completionTokens: 500,
      totalTokens: 2000,
      costUsd: 0.02,
    },
    {
      id: "turn-2",
      sessionId: "sess-1",
      timestamp: Date.now() - 30000,
      model: "claude-3-haiku",
      promptTokens: 800,
      completionTokens: 200,
      totalTokens: 1000,
      costUsd: 0.005,
    },
  ],
};

const mockMetrics = {
  totalTraces: 42,
  totalSpans: 126,
  averageLatencyMs: 120,
  errorRate: 0.05,
  phaseBreakdown: {
    context_assembly: { count: 42, avgDurationMs: 50 },
    llm_inference: { count: 42, avgDurationMs: 80 },
    action_resolution: { count: 30, avgDurationMs: 20 },
    tool_execution: { count: 25, avgDurationMs: 150 },
    result_observation: { count: 42, avgDurationMs: 10 },
  },
  toolCallStats: [
    { toolName: "search", count: 20, avgDurationMs: 200, errorRate: 0.1 },
    { toolName: "calculator", count: 15, avgDurationMs: 50, errorRate: 0 },
  ],
};

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

function registerDefaultRoutes() {
  // Sessions
  routes.set("GET:/api/sessions", (_req, res) => {
    json(res, mockSessions);
  });

  routes.set("POST:/api/sessions", (_req, res) => {
    json(res, { id: "sess-new", name: "New Session", createdAt: Date.now() }, 201);
  });

  routes.set("DELETE:/api/sessions/sess-1", (_req, res) => {
    json(res, { ok: true });
  });

  routes.set("DELETE:/api/sessions/sess-2", (_req, res) => {
    json(res, { ok: true });
  });

  // Chat streaming (SSE)
  routes.set("POST:/api/sessions/sess-1/stream", async (_req, res) => {
    await sseStream(res, [
      { content: "Hello" },
      { content: " there" },
      { content: "! How can I help?" },
    ]);
  });

  routes.set("POST:/api/sessions/sess-new/stream", async (_req, res) => {
    await sseStream(res, [
      { content: "Sure" },
      { content: ", I can help" },
      { content: " with that." },
    ]);
  });

  // Config
  routes.set("GET:/api/agent/config", (_req, res) => {
    json(res, mockConfig);
  });

  routes.set("PUT:/api/agent/config", async (req, res) => {
    const body = await readBody(req);
    const parsed = JSON.parse(body);
    // Return the merged config
    json(res, { ...mockConfig, ...parsed });
  });

  // Self-modify
  routes.set("GET:/api/agent/self-modify", (_req, res) => {
    json(res, mockSelfModifyHistory);
  });

  routes.set("GET:/api/agent/self-modify/abc1234def5678", (_req, res) => {
    json(res, mockSelfModifyDetail);
  });

  routes.set("GET:/api/agent/self-modify/def5678abc1234", (_req, res) => {
    json(res, {
      ...mockSelfModifyDetail,
      commitId: "def5678abc1234",
      message: "Updated calculator config",
      action: "replace",
      handlerName: "calculator",
      diff: {
        before: 'export function calc(expr) {\n  return eval(expr);\n}',
        after: 'export function calc(expr) {\n  return safeEval(expr);\n}',
      },
    });
  });

  routes.set("POST:/api/agent/self-modify/rollback", async (_req, res) => {
    json(res, { ok: true });
  });

  // Traces & observability
  routes.set("GET:/api/traces", (_req, res) => {
    json(res, mockTraces);
  });

  routes.set("GET:/api/traces/trace-001/tool-calls", (_req, res) => {
    json(res, mockToolCalls);
  });

  routes.set("GET:/api/traces/trace-002/tool-calls", (_req, res) => {
    json(res, [
      {
        id: "tc-3",
        traceId: "trace-002",
        toolName: "search",
        startTime: Date.now() - 30000,
        duration: 1500,
        status: "error",
        parameters: { query: "failing query" },
        error: "Tool execution timed out",
      },
    ]);
  });

  routes.set("GET:/api/metrics", (_req, res) => {
    json(res, mockMetrics);
  });

  routes.set("GET:/api/costs", (_req, res) => {
    json(res, mockCosts);
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function json(res: http.ServerResponse, data: unknown, status = 200) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (chunk: Buffer) => (body += chunk.toString()));
    req.on("end", () => resolve(body));
  });
}

/**
 * Send a Server-Sent Events stream response.
 */
async function sseStream(
  res: http.ServerResponse,
  chunks: Array<Record<string, unknown>>,
): Promise<void> {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  for (const chunk of chunks) {
    res.write(`data: ${JSON.stringify(chunk)}\n\n`);
    await new Promise((r) => setTimeout(r, 50));
  }

  res.write("data: [DONE]\n\n");
  res.end();
}

// ---------------------------------------------------------------------------
// Server lifecycle
// ---------------------------------------------------------------------------

let server: http.Server | null = null;

export async function startMockServer(port = 3000): Promise<void> {
  routes.clear();
  registerDefaultRoutes();

  server = http.createServer(async (req, res) => {
    const method = req.method ?? "GET";
    const url = req.url?.split("?")[0] ?? "/";
    const key = `${method}:${url}`;

    const handler = routes.get(key);
    if (handler) {
      await handler(req, res);
    } else {
      // Return 404 with a helpful message so failing tests are easy to debug.
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: `No mock for ${method} ${url}` }));
    }
  });

  await new Promise<void>((resolve) => server!.listen(port, resolve));
  console.log(`[mock-server] listening on http://localhost:${port}`);
}

export async function stopMockServer(): Promise<void> {
  if (server) {
    await new Promise<void>((resolve, reject) =>
      server!.close((err) => (err ? reject(err) : resolve())),
    );
    server = null;
    console.log("[mock-server] stopped");
  }
}

/**
 * Register a custom route at runtime (useful inside individual tests).
 */
export function addMockRoute(
  method: string,
  path: string,
  handler: Handler,
): void {
  routes.set(`${method.toUpperCase()}:${path}`, handler);
}

/**
 * Remove a previously registered custom route.
 */
export function removeMockRoute(method: string, path: string): void {
  routes.delete(`${method.toUpperCase()}:${path}`);
}

// Allow running standalone for debugging: `npx tsx e2e/mock-server.ts`
if (process.argv[1]?.endsWith("mock-server.ts")) {
  startMockServer().then(() =>
    console.log("Press Ctrl+C to stop."),
  );
}
