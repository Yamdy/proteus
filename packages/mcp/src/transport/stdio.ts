// Stdio transport — JSON-RPC over child_process stdin/stdout

import { spawn, type ChildProcess } from "node:child_process";
import { createInterface } from "node:readline";
import { AbstractTransport, type AbstractTransportOptions } from "./abstract.js";
import type {
  JsonRpcRequest,
  JsonRpcNotification,
  StdioTransportOptions,
} from "../types.js";

export type StdioTransportFullOptions = StdioTransportOptions & AbstractTransportOptions;

export class StdioTransport extends AbstractTransport {
  private process: ChildProcess;

  constructor(options: StdioTransportFullOptions) {
    super({ timeoutMs: options.timeoutMs });
    this.process = spawn(options.command, options.args ?? [], {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, ...options.env },
    });

    this.process.on("error", (err) => {
      this.rejectAll(err instanceof Error ? err : new Error(String(err)));
    });

    this.process.on("exit", () => {
      this.rejectAll(new Error("Process exited unexpectedly"));
    });

    // Parse newline-delimited JSON from stdout → deliver responses
    const rl = createInterface({ input: this.process.stdout! });
    rl.on("line", (line) => {
      if (!line.trim()) return;
      try {
        const msg = JSON.parse(line);
        if (msg.id !== undefined) {
          this.deliverResponse(msg);
        }
      } catch {
        // ignore non-JSON lines (debug output, etc.)
      }
    });
  }

  protected async doSend(msg: JsonRpcRequest | JsonRpcNotification): Promise<void> {
    const data = JSON.stringify(msg) + "\n";
    return new Promise<void>((resolve, reject) => {
      this.process.stdin!.write(data, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  protected async doClose(): Promise<void> {
    this.process.stdin!.end();
    this.process.kill();
  }
}
