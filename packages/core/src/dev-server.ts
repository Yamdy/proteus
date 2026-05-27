import http from "node:http";
import type { AddressInfo } from "node:net";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface DevServerOptions {
  port: number;
}

export interface SSEEvent {
  type: "phase:before" | "phase:after" | "turn:start" | "turn:end" | "chain:start" | "chain:end" | "handler:result";
  timestamp: number;
  sessionId: string;
  chainId: string;
  turnId?: string;
  payload: unknown;
}

export class DevServer {
  private readonly port: number;
  private server: http.Server | undefined;
  private readonly clients = new Set<http.ServerResponse>();

  constructor(opts: DevServerOptions) {
    this.port = opts.port;
  }

  get clientCount(): number {
    return this.clients.size;
  }

  async start(): Promise<AddressInfo> {
    this.server = http.createServer((req, res) => {
      if (req.url === "/" && req.method === "GET") {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(INDEX_HTML);
        return;
      }
      if (req.url === "/events" && req.method === "GET") {
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
        });
        res.write(":ok\n\n");
        this.clients.add(res);
        req.on("close", () => this.clients.delete(res));
        return;
      }
      res.writeHead(404);
      res.end("Not Found");
    });

    return new Promise((resolve) => {
      this.server!.listen(this.port, "127.0.0.1", () => {
        resolve(this.server!.address() as AddressInfo);
      });
    });
  }

  broadcast(event: SSEEvent): void {
    const frame = `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
    for (const client of this.clients) {
      client.write(frame);
    }
  }

  async close(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.server) return resolve();
      this.server.close((err) => (err ? reject(err) : resolve()));
    });
  }
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const INDEX_HTML = fs.readFileSync(
  path.join(__dirname, "dev-server-ui.html"),
  "utf-8",
);
