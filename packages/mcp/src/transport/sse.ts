// SSE transport — JSON-RPC over HTTP POST + EventSource for responses

import { AbstractTransport, type AbstractTransportOptions } from "./abstract.js";
import type {
  JsonRpcRequest,
  JsonRpcNotification,
  SseTransportOptions,
} from "../types.js";

export type SseTransportFullOptions = SseTransportOptions & AbstractTransportOptions;

export class SseTransport extends AbstractTransport {
  private url: string;
  private headers: Record<string, string>;
  private eventSource: EventSource | null = null;

  constructor(options: SseTransportFullOptions) {
    super({ timeoutMs: options.timeoutMs });
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
          const msg = JSON.parse(event.data);
          if (msg.id !== undefined) {
            this.deliverResponse(msg);
          }
        } catch {
          // ignore non-JSON messages
        }
      };
    });
  }

  protected async doSend(msg: JsonRpcRequest | JsonRpcNotification): Promise<void> {
    const response = await fetch(this.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...this.headers,
      },
      body: JSON.stringify(msg),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
  }

  protected async doClose(): Promise<void> {
    this.eventSource?.close();
    this.eventSource = null;
  }
}
