import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ProteusServer, createServer } from "./server.js";

describe("ProteusServer", () => {
  let server: ProteusServer;

  afterEach(async () => {
    if (server) {
      await server.stop();
    }
  });

  it("creates server with default options", () => {
    server = createServer();
    expect(server).toBeInstanceOf(ProteusServer);
  });

  it("creates server with custom options", () => {
    server = createServer({ port: 4000, host: "localhost", cors: false });
    expect(server).toBeInstanceOf(ProteusServer);
  });

  it("starts and stops cleanly", async () => {
    server = createServer({ port: 0 }); // random port
    await server.start();
    await server.stop();
  });

  describe("GET /health", () => {
    beforeEach(async () => {
      server = createServer({ port: 0 });
      await server.start();
    });

    it("returns health response", async () => {
      const response = await server.instance.inject({
        method: "GET",
        url: "/health",
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.status).toBe("ok");
      expect(body.version).toBe("0.0.1");
      expect(typeof body.uptime).toBe("number");
    });
  });
});
