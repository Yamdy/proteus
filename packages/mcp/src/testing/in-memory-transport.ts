// In-memory transport pair for testing — McpClient ↔ McpServer without network

import type {
  ClientTransport,
  ServerTransport,
  JsonRpcRequest,
  JsonRpcResponse,
  JsonRpcNotification,
} from "../types.js";

/**
 * Creates a linked pair of transports for in-process client↔server testing.
 * Messages sent on one side are received on the other.
 */
export function createTransportPair(): {
  client: ClientTransport;
  server: ServerTransport;
} {
  const clientToServer: string[] = [];
  const serverToClient: string[] = [];

  let clientWaiter: ((msg: string) => void) | null = null;
  let serverWaiter: ((msg: string) => void) | null = null;
  let closed = false;

  const client: ClientTransport = {
    async sendRequest(request: JsonRpcRequest): Promise<JsonRpcResponse> {
      // Put request in the server's queue
      const data = JSON.stringify(request);
      if (serverWaiter) {
        const w = serverWaiter;
        serverWaiter = null;
        w(data);
      } else {
        clientToServer.push(data);
      }

      // Wait for the correlated response
      return new Promise<JsonRpcResponse>((resolve) => {
        clientWaiter = (data: string) => resolve(JSON.parse(data));
      });
    },

    async sendNotification(notification: JsonRpcNotification): Promise<void> {
      const data = JSON.stringify(notification);
      if (serverWaiter) {
        const w = serverWaiter;
        serverWaiter = null;
        w(data);
      } else {
        clientToServer.push(data);
      }
    },

    async close() {
      closed = true;
      clientToServer.length = 0;
      serverToClient.length = 0;
      if (serverWaiter) {
        const w = serverWaiter;
        serverWaiter = null;
        // Flush server waiter with a sentinel that receive() can reject
        w("__closed__");
      }
    },
  };

  const server: ServerTransport = {
    async receive(): Promise<JsonRpcRequest | JsonRpcNotification> {
      if (closed) throw new Error("Transport closed");
      if (clientToServer.length > 0) return JSON.parse(clientToServer.shift()!);
      return new Promise<JsonRpcRequest | JsonRpcNotification>((resolve, reject) => {
        serverWaiter = (data: string) => {
          if (data === "__closed__") {
            reject(new Error("Transport closed"));
          } else {
            resolve(JSON.parse(data));
          }
        };
      });
    },

    async send(response: JsonRpcResponse): Promise<void> {
      const data = JSON.stringify(response);
      if (clientWaiter) {
        const w = clientWaiter;
        clientWaiter = null;
        w(data);
      } else {
        serverToClient.push(data);
      }
    },

    async close() {
      closed = true;
      clientToServer.length = 0;
      serverToClient.length = 0;
      if (clientWaiter) {
        const w = clientWaiter;
        clientWaiter = null;
        w(JSON.stringify({ jsonrpc: "2.0", id: 0, error: { code: -32000, message: "Transport closed" } }));
      }
    },
  };

  return { client, server };
}
