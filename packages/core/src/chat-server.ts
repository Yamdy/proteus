import http from "node:http";
import type { AddressInfo } from "node:net";
import { AgentContext, SessionContext } from "./context.js";
import { Harness } from "./harness.js";
import { SessionManager } from "./session-manager.js";
import type { HandlerEngine } from "./handler-engine.js";
import type { CheckpointStore } from "./checkpoint-store.js";
import type { LLMProvider, SessionConfig } from "./index.js";

export interface ChatServerOptions {
  port: number;
  llm: LLMProvider;
  store: CheckpointStore;
  engine: HandlerEngine;
}

const DEFAULT_SESSION_CONFIG: SessionConfig = {
  sessionId: "",
  llm: { provider: "openai", model: "gpt-4o", temperature: 0 },
  tools: {},
  logLevel: "info",
};

export class ChatServer {
  private readonly port: number;
  private readonly llm: LLMProvider;
  private readonly engine: HandlerEngine;
  private readonly sessionManager: SessionManager;
  private readonly harness: Harness;
  private readonly clients = new Set<http.ServerResponse>();
  private server: http.Server | undefined;

  constructor(opts: ChatServerOptions) {
    this.port = opts.port;
    this.llm = opts.llm;
    this.engine = opts.engine;
    this.sessionManager = new SessionManager({ store: opts.store });
    this.harness = new Harness({ store: opts.store });
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
      // SSE
      if (url.pathname === "/events" && method === "GET") {
        this.handleSSE(req, res);
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
    const result = await this.harness.runTurn(session, agent);

    // Extract response from working memory (last assistant message)
    const messages = session.workingMemory.getMessages();
    const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
    const responseText = lastAssistant?.content ?? "";

    // Broadcast SSE event
    this.broadcast({
      type: "turn:complete",
      data: { sessionId, turnId: result.turnId, status: result.status, response: responseText },
    });

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ sessionId, turnId: result.turnId, status: result.status, response: responseText }));
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
