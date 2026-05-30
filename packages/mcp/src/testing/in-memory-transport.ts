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
      clientToServer.length = 0;
      serverToClient.length = 0;
    },
  };

  const server: ServerTransport = {
    async receive(): Promise<JsonRpcRequest | JsonRpcNotification> {
      if (clientToServer.length > 0) return JSON.parse(clientToServer.shift()!);
      return new Promise<JsonRpcRequest | JsonRpcNotification>((resolve) => {
        serverWaiter = (data: string) => resolve(JSON.parse(data));
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
      clientToServer.length = 0;
      serverToClient.length = 0;
    },
  };

  return { client, server };
}
