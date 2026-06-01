// @proteus/server — Fastify server implementation

import Fastify from "fastify";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import type { FastifyInstance } from "fastify";
import {
  SessionManager,
  createInMemoryStore,
  InMemoryCheckpointLog,
  Harness,
  AgentContext,
  HandlerEngine,
  registerBuiltins,
  registerBuiltInProcessors,
} from "@proteus/core";
import type {
  MetricsCollector,
  CostStore,
  EventLog,
  SessionStore,
  LifecycleStateMachine,
  ConfigSnapshotManager,
  LLMProvider,
  Tool,
  CheckpointLog,
} from "@proteus/core";
import { sessionRoutes } from "./routes/sessions.js";
import { registerMetricsRoutes } from "./routes/metrics.js";
import { registerStatusRoutes, type StatusRouteDeps } from "./routes/status.js";
import { registerChatRoutes } from "./routes/chat.js";
import { registerWsRoutes, EventBus } from "./routes/ws.js";
import { registerSelfModifyRoutes } from "./routes/self-modify.js";

export interface ServerOptions {
  port?: number;
  host?: string;
  cors?: boolean;
  store?: SessionStore;
  sessionStore?: SessionStore;
  metrics?: MetricsCollector;
  costStore?: CostStore;
  eventLog?: EventLog;
  handlerCount?: number;
  lifecycle?: LifecycleStateMachine;
  configManager?: ConfigSnapshotManager;
  sessionId?: string;
  checkpointLog?: CheckpointLog;
  llm?: LLMProvider;
  tools?: Map<string, Tool>;
  eventBus?: EventBus;
}

export class ProteusServer {
  private app: FastifyInstance;
  private port: number;
  private host: string;
  private readonly _sessionManager: SessionManager;
  private readonly _harness: Harness;
  private readonly _agent?: AgentContext;

  constructor(options: ServerOptions = {}) {
    this.port = options.port ?? 3000;
    this.host = options.host ?? "0.0.0.0";

    this.app = Fastify({
      logger: true,
    });

    if (options.cors !== false) {
      this.app.register(cors);
    }
    this.app.register(websocket);

    this._sessionManager = new SessionManager({
      store: options.store ?? createInMemoryStore(),
    });

    this._harness = new Harness({
      store: options.checkpointLog ?? new InMemoryCheckpointLog(),
    });

    if (options.llm) {
      const engine = new HandlerEngine();
      registerBuiltins(engine);
      registerBuiltInProcessors(engine);
      this._agent = new AgentContext({
        llm: options.llm,
        tools: options.tools ?? new Map(),
        handlerEngine: engine,
      });
    }

    this.registerRoutes(options);
  }

  get sessionManager(): SessionManager {
    return this._sessionManager;
  }

  get harness(): Harness {
    return this._harness;
  }

  private registerRoutes(options: ServerOptions): void {
    // Health endpoint (no /api prefix — used by load balancers)
    this.app.get("/health", async () => {
      return {
        status: "ok",
        version: "0.0.1",
        uptime: process.uptime(),
      };
    });

    // Session CRUD routes
    this.app.register(sessionRoutes, {
      prefix: "/sessions",
      sessionManager: this._sessionManager,
      harness: this._harness,
      agent: this._agent,
    });

    // Status and config endpoints
    const statusDeps: StatusRouteDeps = {
      metrics: options.metrics,
      lifecycle: options.lifecycle,
      configManager: options.configManager,
      sessionId: options.sessionId,
    };
    this.app.register(async (app) => registerStatusRoutes(app, statusDeps));

    // POST /chat — synchronous inference (only when LLM is configured)
    if (this._agent) {
      this.app.register(
        (app) => registerChatRoutes(app, {
          sessionManager: this._sessionManager,
          harness: this._harness,
          agent: this._agent!,
        }),
        { prefix: "/chat" },
      );
    }

    // Metrics / Costs / Traces / Detailed health
    this.app.register(registerMetricsRoutes, {
      metrics: options.metrics,
      costStore: options.costStore,
      eventLog: options.eventLog,
      sessionStore: options.sessionStore,
      handlerCount: options.handlerCount,
    });

    // Self-Modify history / detail / rollback
    this.app.register(async (app) => registerSelfModifyRoutes(app), {
      prefix: "/self-modify",
    });

    // WebSocket event push (not under /api — ws://host/ws)
    const eventBus = options.eventBus ?? new EventBus(options.eventLog);
    this.app.register(async (app) => registerWsRoutes(app, { eventBus }));
  }

  async start(): Promise<void> {
    await this.app.listen({ port: this.port, host: this.host });
  }

  async stop(): Promise<void> {
    await this.app.close();
  }

  get instance(): FastifyInstance {
    return this.app;
  }
}

export function createServer(options?: ServerOptions): ProteusServer {
  return new ProteusServer(options);
}
