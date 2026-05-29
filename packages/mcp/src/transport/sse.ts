// SSE transport — JSON-RPC over HTTP POST + EventSource for responses

import type {
  Transport,
  JsonRpcRequest,
  JsonRpcResponse,
  JsonRpcNotification,
  SseTransportOptions,
} from "../types.js";

export class SseTransport implements Transport {
  private url: string;
  private headers: Record<string, string>;
  private eventSource: EventSource | null = null;
  private pending: Map<
    number | string,
    { resolve: (r: JsonRpcResponse) => void; reject: (e: Error) => void }
  > = new Map();
  private messageQueue: JsonRpcResponse[] = [];
  private waiters: ((msg: JsonRpcResponse) => void)[] = [];

  constructor(options: SseTransportOptions) {
    this.url = options.url;
    this.headers = options.headers ?? {};
  }

  /** Connect to the SSE endpoint to receive responses. */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.eventSource = new EventSource(this.url);

      this.eventSource.onopen = () => resolve();

      this.eventSource.onerror = () => {
        if (this.eventSource?.readyState === EventSource.CLOSED) {
          reject(new Error("SSE connection closed"));
        }
      };

      this.eventSource.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as JsonRpcResponse;
          // Check if this is a response to a pending request
          if (msg.id !== undefined && this.pending.has(msg.id)) {
            const { resolve } = this.pending.get(msg.id)!;
            this.pending.delete(msg.id);
            resolve(msg);
          } else if (this.waiters.length > 0) {
            const waiter = this.waiters.shift()!;
            waiter(msg);
          } else {
            this.messageQueue.push(msg);
          }
        } catch {
          // ignore non-JSON messages
        }
      };
    });
  }

  async send(message: JsonRpcRequest | JsonRpcNotification): Promise<void> {
    const response = await fetch(this.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...this.headers,
      },
      body: JSON.stringify(message),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
  }

  async receive(): Promise<JsonRpcResponse> {
    if (this.messageQueue.length > 0) {
      return this.messageQueue.shift()!;
    }
    return new Promise<JsonRpcResponse>((resolve) => {
      this.waiters.push(resolve);
    });
  }

  /** Send a request and wait for its JSON-RPC response via SSE. */
  async sendAndWait(request: JsonRpcRequest): Promise<JsonRpcResponse> {
    return new Promise<JsonRpcResponse>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(request.id);
        reject(new Error(`Request ${request.id} timed out`));
      }, 30_000);

      this.pending.set(request.id, {
        resolve: (r) => {
          clearTimeout(timeout);
          resolve(r);
        },
        reject: (e) => {
          clearTimeout(timeout);
          reject(e);
        },
      });

      this.send(request).catch((err) => {
        this.pending.delete(request.id);
        clearTimeout(timeout);
        reject(err instanceof Error ? err : new Error(String(err)));
      });
    });
  }

  async close(): Promise<void> {
    for (const { reject } of this.pending.values()) {
      reject(new Error("Transport closed"));
    }
    this.pending.clear();
    this.eventSource?.close();
    this.eventSource = null;
  }
}
