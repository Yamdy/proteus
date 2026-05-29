// TODO(TEMP): This file is a temporary studio placeholder for dev-server visualization.
// Remove when packages/studio/ is complete. Do NOT add production features here.

import http from "node:http";
import type { AddressInfo } from "node:net";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AgentContext } from "./context.js";
import { Harness } from "./harness.js";
import { SessionManager } from "./session-manager.js";
import type { HandlerEngine } from "./handler-engine.js";
import type { CheckpointStore } from "./checkpoint-store.js";
import type { LLMProvider, SessionConfig } from "./types.js";
import { buildHealthResponse, type MetricsCollector } from "./metrics-collector.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let INDEX_HTML = "";
try {
  INDEX_HTML = fs.readFileSync(path.join(__dirname, "dev-server-ui.html"), "utf-8");
} catch {
  // Visualizer HTML not available (e.g. running from dist without copy)
}

export interface ChatServerOptions {
  port: number;
  llm: LLMProvider;
  store: CheckpointStore;
  engine: HandlerEngine;
  llmFactory?: (baseUrl: string, model: string, apiKey: string) => LLMProvider;
  llmConfig?: { baseUrl?: string; model?: string; apiKey?: string };
  dataDir?: string;
  metricsCollector?: MetricsCollector;
}

const DEFAULT_SESSION_CONFIG: SessionConfig = {
  sessionId: "",
  llm: { provider: "openai", model: "gpt-4o", temperature: 0 },
  tools: {},
  logLevel: "info",
};

export class ChatServer {
  private readonly port: number;
  private llm: LLMProvider;
  private readonly engine: HandlerEngine;
  private readonly sessionManager: SessionManager;
  private readonly harness: Harness;
  private readonly clients = new Set<http.ServerResponse>();
  private readonly llmFactory?: (baseUrl: string, model: string, apiKey: string) => LLMProvider;
  private llmConfig = { baseUrl: "", model: "gpt-4o", apiKey: "" };
  private server: http.Server | undefined;
  private readonly dataFile: string | undefined;
  private readonly metricsCollector?: MetricsCollector;
  private readonly startTime = Date.now();
  private chatData: { sessions: Record<string, { messages: Array<{ role: string; content: string; thinking?: string }> }> } = { sessions: {} };

  constructor(opts: ChatServerOptions) {
    this.port = opts.port;
    this.llm = opts.llm;
    this.engine = opts.engine;
    this.llmFactory = opts.llmFactory;
    if (opts.llmConfig) {
      this.llmConfig = {
        baseUrl: opts.llmConfig.baseUrl ?? "",
        model: opts.llmConfig.model ?? "gpt-4o",
        apiKey: opts.llmConfig.apiKey ?? "",
      };
    }
    if (opts.dataDir) {
      this.dataFile = path.join(opts.dataDir, "chat-data.json");
      this.loadData();
    }
    this.metricsCollector = opts.metricsCollector;
    this.sessionManager = new SessionManager({ store: opts.store });
    this.harness = new Harness({ store: opts.store });

    // Restore sessions from persisted data
    this.restoreSessions();

    // Hook engine events to SSE broadcast
    this.setupEventForwarding();
  }

  private loadData(): void {
    if (!this.dataFile) return;
    try {
      const raw = fs.readFileSync(this.dataFile, "utf-8");
      this.chatData = JSON.parse(raw);
    } catch {
      this.chatData = { sessions: {} };
    }
  }

  private saveData(): void {
    if (!this.dataFile) return;
    try {
      fs.writeFileSync(this.dataFile, JSON.stringify(this.chatData, null, 2));
    } catch (err) {
      console.error("Failed to save chat data:", err);
    }
  }

  private restoreSessions(): void {
    for (const [sessionId, data] of Object.entries(this.chatData.sessions)) {
      if (!this.sessionManager.get(sessionId)) {
        this.sessionManager.create(sessionId, { ...DEFAULT_SESSION_CONFIG, sessionId });
        const session = this.sessionManager.get(sessionId);
        if (session) {
          for (const msg of data.messages) {
            session.workingMemory.push({ role: msg.role as any, content: msg.content, thinking: msg.thinking } as any);
          }
        }
      }
    }
  }

  private setupEventForwarding(): void {
    const events = [
      "turn:start", "turn:end",
      "phase:before", "phase:after",
      "chain:start", "chain:end",
    ];
    for (const event of events) {
      this.engine.observe(event, async (payload: unknown) => {
        this.broadcast({ type: event, data: { payload, timestamp: Date.now() } });
        return { ok: true };
      }, 0, `sse-${event}`);
    }
  }

  broadcastToken(token: string): void {
    this.broadcast({ type: "token", data: { token, timestamp: Date.now() } });
  }

  broadcastThinking(token: string): void {
    this.broadcast({ type: "thinking", data: { token, timestamp: Date.now() } });
  }

  async start(): Promise<AddressInfo> {
    this.server = http.createServer((req, res) => this.handleRequest(req, res));
    return new Promise((resolve) => {
      this.server!.listen(this.port, "127.0.0.1", () => {
        resolve(this.server!.address() as AddressInfo);
      });
    });
  }

  async close(): Promise<void> {
    for (const client of this.clients) {
      client.destroy();
    }
    this.clients.clear();
    return new Promise((resolve, reject) => {
      if (!this.server) return resolve();
      this.server.close((err) => (err ? reject(err) : resolve()));
    });
  }

  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const url = new URL(req.url ?? "/", `http://localhost:${this.port}`);
    const method = req.method ?? "GET";

    // CORS headers
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    try {
      // Visualizer UI
      if (url.pathname === "/" && method === "GET") {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(INDEX_HTML);
        return;
      }

      // SSE
      if (url.pathname === "/events" && method === "GET") {
        this.handleSSE(req, res);
        return;
      }

      // Health
      if (url.pathname === "/health" && method === "GET") {
        this.handleHealth(res);
        return;
      }

      // Sessions
      if (url.pathname === "/sessions" && method === "GET") {
        this.handleListSessions(res);
        return;
      }
      if (url.pathname === "/sessions" && method === "POST") {
        await this.handleCreateSession(req, res);
        return;
      }
      if (url.pathname.startsWith("/sessions/") && url.pathname.endsWith("/messages") && method === "GET") {
        const sessionId = url.pathname.slice("/sessions/".length, -"/messages".length);
        this.handleGetMessages(sessionId, res);
        return;
      }
      if (url.pathname.startsWith("/sessions/") && method === "DELETE") {
        const sessionId = url.pathname.slice("/sessions/".length);
        this.handleDestroySession(sessionId, res);
        return;
      }

      // Chat
      if (url.pathname === "/chat" && method === "POST") {
        await this.handleChat(req, res);
        return;
      }

      // Config
      if (url.pathname === "/config" && method === "GET") {
        this.handleGetConfig(res);
        return;
      }
      if (url.pathname === "/config" && method === "POST") {
        await this.handleUpdateConfig(req, res);
        return;
      }

      res.writeHead(404);
      res.end("Not Found");
    } catch (err) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
    }
  }

  private handleSSE(req: http.IncomingMessage, res: http.ServerResponse): void {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    });
    res.write(":ok\n\n");
    this.clients.add(res);
    req.on("close", () => this.clients.delete(res));
  }

  broadcast(event: { type: string; data: unknown }): void {
    const frame = `event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`;
    for (const client of this.clients) {
      client.write(frame);
    }
  }

  private handleListSessions(res: http.ServerResponse): void {
    const sessions = this.sessionManager.list();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ sessions }));
  }

  private async handleCreateSession(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const body = await this.readBody(req);
    const { sessionId, config } = body as { sessionId: string; config?: SessionConfig };
    if (!sessionId) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: "sessionId is required" }));
      return;
    }

    try {
      const sessionConfig = config ?? { ...DEFAULT_SESSION_CONFIG, sessionId };
      this.sessionManager.create(sessionId, sessionConfig);
      res.writeHead(201, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ sessionId }));
    } catch (err) {
      if (err instanceof Error && err.message.includes("already exists")) {
        res.writeHead(409);
        res.end(JSON.stringify({ error: err.message }));
        return;
      }
      throw err;
    }
  }

  private handleDestroySession(sessionId: string, res: http.ServerResponse): void {
    if (!this.sessionManager.get(sessionId)) {
      res.writeHead(404);
      res.end(JSON.stringify({ error: `Session "${sessionId}" not found` }));
      return;
    }
    this.sessionManager.destroy(sessionId);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ sessionId, destroyed: true }));
  }

  private handleGetMessages(sessionId: string, res: http.ServerResponse): void {
    const session = this.sessionManager.get(sessionId);
    if (!session) {
      res.writeHead(404);
      res.end(JSON.stringify({ error: `Session "${sessionId}" not found` }));
      return;
    }
    const messages = session.workingMemory.getMessages();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ messages }));
  }

  private async handleChat(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const body = await this.readBody(req);
    const { message, sessionId: requestedId } = body as { message?: string; sessionId?: string };

    if (!message) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: "message is required" }));
      return;
    }

    // Get or create session
    let sessionId = requestedId;
    if (!sessionId) {
      sessionId = `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      this.sessionManager.create(sessionId, { ...DEFAULT_SESSION_CONFIG, sessionId });
    }

    const session = this.sessionManager.get(sessionId);
    if (!session) {
      res.writeHead(404);
      res.end(JSON.stringify({ error: `Session "${sessionId}" not found` }));
      return;
    }

    // Add user message to working memory
    session.workingMemory.push({ role: "user", content: message });

    // Create agent context
    const agent = new AgentContext({
      llm: this.llm,
      tools: new Map(),
      handlerEngine: this.engine,
    });

    // Run through harness
    let result;
    try {
      result = await this.harness.runTurn(session, agent);
    } catch (err) {
      console.error("Harness error:", err);
      throw err;
    }

    // Extract response from working memory (last assistant message)
    const messages = session.workingMemory.getMessages();
    const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
    const responseText = lastAssistant?.content ?? "";

    // Persist messages
    this.chatData.sessions[sessionId] = {
      messages: messages.map((m) => ({ role: m.role, content: m.content, thinking: (m as any).thinking })),
    };
    this.saveData();

    // Broadcast SSE event
    this.broadcast({
      type: "turn:complete",
      data: { sessionId, turnId: result.turnId, status: result.status, response: responseText },
    });

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ sessionId, turnId: result.turnId, status: result.status, response: responseText }));
  }

  private handleHealth(res: http.ServerResponse): void {
    const metrics = this.metricsCollector?.getMetrics() ?? {
      turnCount: 0,
      activeChains: 0,
      lastTurnDuration: 0,
      lastTurnStatus: null,
      consecutiveErrors: 0,
      lastTurnTimestamp: null,
    };
    const costTotals = { promptTokens: 0, completionTokens: 0 };
    const handlerCount = this.engine.serialize().handlers.length;
    const response = buildHealthResponse({
      metrics,
      costTotals,
      handlerCount,
      sessionId: "",
      uptime: Date.now() - this.startTime,
    });
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(response));
  }

  private handleGetConfig(res: http.ServerResponse): void {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      baseUrl: this.llmConfig.baseUrl,
      model: this.llmConfig.model,
      hasApiKey: !!this.llmConfig.apiKey,
    }));
  }

  private async handleUpdateConfig(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const body = await this.readBody(req);
    const { baseUrl, model, apiKey } = body as { baseUrl?: string; model?: string; apiKey?: string };

    if (baseUrl !== undefined) this.llmConfig.baseUrl = baseUrl;
    if (model) this.llmConfig.model = model;
    if (apiKey !== undefined) this.llmConfig.apiKey = apiKey;

    if (this.llmFactory && this.llmConfig.apiKey && this.llmConfig.baseUrl) {
      try {
        this.llm = this.llmFactory(this.llmConfig.baseUrl, this.llmConfig.model, this.llmConfig.apiKey);
      } catch (err) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: `Failed to create LLM: ${err instanceof Error ? err.message : String(err)}` }));
        return;
      }
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, baseUrl: this.llmConfig.baseUrl, model: this.llmConfig.model }));
  }

  private readBody(req: http.IncomingMessage): Promise<unknown> {
    return new Promise((resolve, reject) => {
      let data = "";
      req.on("data", (chunk) => (data += chunk));
      req.on("end", () => {
        try {
          resolve(data ? JSON.parse(data) : {});
        } catch {
          resolve({});
        }
      });
      req.on("error", reject);
    });
  }
}
