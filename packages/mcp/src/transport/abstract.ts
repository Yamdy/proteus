// AbstractTransport — shared timeout + pending-map logic for ClientTransport

import type {
  ClientTransport,
  JsonRpcRequest,
  JsonRpcResponse,
  JsonRpcNotification,
} from "../types.js";

interface PendingEntry {
  resolve: (r: JsonRpcResponse) => void;
  reject: (e: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export interface AbstractTransportOptions {
  /** Timeout in ms for request/response correlation. Default: 30_000 */
  timeoutMs?: number;
}

/**
 * Base class for ClientTransport implementations.
 * Handles request ID → response correlation with configurable timeout.
 * Subclasses implement doSend() and doClose().
 */
export abstract class AbstractTransport implements ClientTransport {
  protected readonly timeoutMs: number;
  private pending: Map<number | string, PendingEntry> = new Map();
  private closed = false;

  constructor(options?: AbstractTransportOptions) {
    this.timeoutMs = options?.timeoutMs ?? 30_000;
  }

  async sendRequest(request: JsonRpcRequest): Promise<JsonRpcResponse> {
    if (this.closed) throw new Error("Transport is closed");

    return new Promise<JsonRpcResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(request.id);
        reject(new Error(`Request ${request.id} timed out after ${this.timeoutMs}ms`));
      }, this.timeoutMs);

      this.pending.set(request.id, {
        resolve: (r) => {
          clearTimeout(timer);
          resolve(r);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
        timer,
      });

      this.doSend(request).catch((err) => {
        this.pending.delete(request.id);
        clearTimeout(timer);
        reject(err instanceof Error ? err : new Error(String(err)));
      });
    });
  }

  async sendNotification(notification: JsonRpcNotification): Promise<void> {
    if (this.closed) throw new Error("Transport is closed");
    await this.doSend(notification);
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.rejectAll(new Error("Transport closed"));
    await this.doClose();
  }

  // --- Subclass hooks ---

  /** Send a raw message over the wire. */
  protected abstract doSend(msg: JsonRpcRequest | JsonRpcNotification): Promise<void>;

  /** Release underlying resources (process, socket, etc.). */
  protected abstract doClose(): Promise<void>;

  /** Call from subclass when a response arrives from the wire. */
  protected deliverResponse(response: JsonRpcResponse): void {
    const entry = this.pending.get(response.id);
    if (entry) {
      this.pending.delete(response.id);
      entry.resolve(response);
    }
  }

  /** Reject all pending requests (used on close/error). */
  protected rejectAll(err: Error): void {
    for (const entry of this.pending.values()) {
      clearTimeout(entry.timer);
      entry.reject(err);
    }
    this.pending.clear();
  }
}
