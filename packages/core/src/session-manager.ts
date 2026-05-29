import { SessionContext } from "./context.js";
import type { CheckpointStore } from "./checkpoint-store.js";
import type { SessionConfig } from "./types.js";

export interface SessionManagerOptions {
  store: CheckpointStore;
}

export class SessionManager {
  private readonly store: CheckpointStore;
  private readonly sessions = new Map<string, SessionContext>();

  constructor(opts: SessionManagerOptions) {
    this.store = opts.store;
    this.loadExistingSessions();
  }

  private loadExistingSessions(): void {
    const metas = this.store.listSessions();
    for (const meta of metas) {
      if ((meta as any).destroyed) continue;
      const session = new SessionContext(meta.config);
      this.sessions.set(meta.sessionId, session);
    }
  }

  create(sessionId: string, config: SessionConfig): SessionContext {
    if (this.sessions.has(sessionId)) {
      throw new Error(`Session "${sessionId}" already exists`);
    }
    const session = new SessionContext(config);
    this.sessions.set(sessionId, session);
    this.store.createSession({ sessionId, config });
    return session;
  }

  get(sessionId: string): SessionContext | undefined {
    return this.sessions.get(sessionId);
  }

  destroy(sessionId: string): void {
    if (!this.sessions.has(sessionId)) return;
    this.sessions.delete(sessionId);
    this.store.updateSession(sessionId, { destroyed: true } as any);
  }

  list(): string[] {
    return [...this.sessions.keys()];
  }
}
