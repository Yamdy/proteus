// Stdio transport — JSON-RPC over child_process stdin/stdout

import { spawn, type ChildProcess } from "node:child_process";
import { createInterface } from "node:readline";
import type {
  Transport,
  JsonRpcRequest,
  JsonRpcResponse,
  JsonRpcNotification,
  StdioTransportOptions,
} from "../types.js";

export class StdioTransport implements Transport {
  private process: ChildProcess;
  private pending: Map<
    number | string,
    { resolve: (r: JsonRpcResponse) => void; reject: (e: Error) => void }
  > = new Map();
  private closed = false;

  constructor(options: StdioTransportOptions) {
    this.process = spawn(options.command, options.args ?? [], {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, ...options.env },
    });

    this.process.on("error", (err) => {
      this.rejectAll(err instanceof Error ? err : new Error(String(err)));
    });

    this.process.on("exit", () => {
      if (!this.closed) {
        this.rejectAll(new Error("Process exited unexpectedly"));
      }
    });

    // Parse newline-delimited JSON from stdout
    const rl = createInterface({ input: this.process.stdout! });
    rl.on("line", (line) => {
      if (!line.trim()) return;
      try {
        const msg = JSON.parse(line) as JsonRpcResponse;
        if (msg.id !== undefined && this.pending.has(msg.id)) {
          const { resolve } = this.pending.get(msg.id)!;
          this.pending.delete(msg.id);
          resolve(msg);
        }
      } catch {
        // ignore non-JSON lines (debug output, etc.)
      }
    });
  }

  async send(message: JsonRpcRequest | JsonRpcNotification): Promise<void> {
    if (this.closed) throw new Error("Transport is closed");
    const data = JSON.stringify(message) + "\n";
    return new Promise<void>((resolve, reject) => {
      this.process.stdin!.write(data, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  async receive(): Promise<JsonRpcResponse> {
    throw new Error("Use sendAndWait() for stdio transport");
  }

  /** Send a request and wait for its JSON-RPC response. */
  async sendAndWait(request: JsonRpcRequest): Promise<JsonRpcResponse> {
    if (this.closed) throw new Error("Transport is closed");
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
    if (this.closed) return;
    this.closed = true;
    this.rejectAll(new Error("Transport closed"));
    this.process.stdin!.end();
    this.process.kill();
  }

  private rejectAll(err: Error): void {
    for (const { reject } of this.pending.values()) {
      reject(err);
    }
    this.pending.clear();
  }
}
