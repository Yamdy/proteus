import { describe, it, expect, afterEach } from "vitest";
import http from "node:http";
import { DevServer } from "./dev-server.js";

function get(url: string): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => resolve({ status: res.statusCode!, headers: res.headers, body }));
    }).on("error", reject);
  });
}

function connectSSE(url: string): Promise<{ status: number; headers: http.IncomingHttpHeaders; close: () => void; waitForChunk: (afterIndex: number, timeoutMs?: number) => Promise<string> }> {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      const chunks: string[] = [];
      const waiters: Array<{ afterIndex: number; resolve: (chunk: string) => void; timer: ReturnType<typeof setTimeout> }> = [];

      res.on("data", (chunk: Buffer) => {
        const str = chunk.toString();
        chunks.push(str);
        for (let i = waiters.length - 1; i >= 0; i--) {
          if (chunks.length > waiters[i].afterIndex) {
            clearTimeout(waiters[i].timer);
            waiters[i].resolve(chunks[chunks.length - 1]);
            waiters.splice(i, 1);
          }
        }
      });

      const waitForChunk = (afterIndex: number, timeoutMs = 2000): Promise<string> =>
        new Promise((res, rej) => {
          if (chunks.length > afterIndex) return res(chunks[chunks.length - 1]);
          const timer = setTimeout(() => rej(new Error("timeout waiting for chunk")), timeoutMs);
          waiters.push({ afterIndex, resolve: res, timer });
        });

      res.once("data", () => {
        resolve({
          status: res.statusCode!,
          headers: res.headers,
          close: () => req.destroy(),
          waitForChunk,
        });
      });
    });
    req.on("error", reject);
  });
}

describe("DevServer — basic HTTP", () => {
  let server: DevServer | undefined;

  afterEach(async () => {
    if (server) {
      await server.close();
      server = undefined;
    }
  });

  it("starts on configurable port and serves HTML at /", async () => {
    server = new DevServer({ port: 0 });
    const addr = await server.start();
    const port = typeof addr === "string" ? 0 : addr.port;

    const res = await get(`http://127.0.0.1:${port}/`);

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/html");
    expect(res.body).toContain("<!DOCTYPE html>");
    expect(res.body).toContain("Proteus");
  });

  it("/events returns SSE headers", async () => {
    server = new DevServer({ port: 0 });
    const addr = await server.start();
    const port = typeof addr === "string" ? 0 : addr.port;

    const sse = await connectSSE(`http://127.0.0.1:${port}/events`);

    expect(sse.status).toBe(200);
    expect(sse.headers["content-type"]).toBe("text/event-stream");
    expect(sse.headers["cache-control"]).toBe("no-cache");
    expect(sse.headers["connection"]).toBe("keep-alive");

    sse.close();
  });

  it("broadcast sends SSE event to connected clients", async () => {
    server = new DevServer({ port: 0 });
    const addr = await server.start();
    const port = typeof addr === "string" ? 0 : addr.port;

    const sse = await connectSSE(`http://127.0.0.1:${port}/events`);

    server.broadcast({
      type: "turn:start",
      timestamp: Date.now(),
      sessionId: "s1",
      chainId: "c1",
      turnId: "t1",
      payload: {},
    });

    const chunk = await sse.waitForChunk(1);
    expect(chunk).toContain("event: turn:start");
    expect(chunk).toContain("data:");
    expect(chunk).toContain("s1");

    sse.close();
  });

  it("multiple clients receive the same broadcast", async () => {
    server = new DevServer({ port: 0 });
    const addr = await server.start();
    const port = typeof addr === "string" ? 0 : addr.port;

    const sse1 = await connectSSE(`http://127.0.0.1:${port}/events`);
    const sse2 = await connectSSE(`http://127.0.0.1:${port}/events`);

    server.broadcast({
      type: "phase:before",
      timestamp: Date.now(),
      sessionId: "s1",
      chainId: "c1",
      turnId: "t1",
      payload: { phaseName: "llm_inference" },
    });

    const [chunk1, chunk2] = await Promise.all([
      sse1.waitForChunk(1),
      sse2.waitForChunk(1),
    ]);

    expect(chunk1).toContain("event: phase:before");
    expect(chunk2).toContain("event: phase:before");

    sse1.close();
    sse2.close();
  });

  it("disconnect removes client from broadcast list", async () => {
    server = new DevServer({ port: 0 });
    const addr = await server.start();
    const port = typeof addr === "string" ? 0 : addr.port;

    const sse1 = await connectSSE(`http://127.0.0.1:${port}/events`);
    const sse2 = await connectSSE(`http://127.0.0.1:${port}/events`);

    expect(server.clientCount).toBe(2);

    sse1.close();

    // Wait a tick for the close event to propagate
    await new Promise((r) => setTimeout(r, 50));

    expect(server.clientCount).toBe(1);

    // Remaining client still receives broadcasts
    server.broadcast({
      type: "turn:end",
      timestamp: Date.now(),
      sessionId: "s1",
      chainId: "c1",
      payload: { status: "completed" },
    });

    const chunk = await sse2.waitForChunk(1);
    expect(chunk).toContain("event: turn:end");

    sse2.close();
  });
});
