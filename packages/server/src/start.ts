// @proteus/server — Standalone entry point for starting the server

import { createServer } from "./server.js";

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? "0.0.0.0";

const server = createServer({ port, host });

server.start().then(() => {
  console.log(`[proteus-server] listening on http://${host}:${port}`);
}).catch((err) => {
  console.error("[proteus-server] failed to start:", err);
  process.exit(1);
});
