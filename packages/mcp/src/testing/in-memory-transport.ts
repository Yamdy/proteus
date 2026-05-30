// In-memory transport pair for testing — McpClient ↔ McpServer without network

import type {
  Transport,
  JsonRpcRequest,
  JsonRpcResponse,
  JsonRpcNotification,
} from "../types.js";

/**
 * Creates a linked pair of transports for in-process client↔server testing.
 * Messages sent on one side are received on the other.
 */
export function createTransportPair(): {
  clientTransport: Transport;
  serverTransport: Transport;
} {
  const clientToServer: string[] = [];
  const serverToClient: string[] = [];

  let clientWaiter: ((msg: string) => void) | null = null;
  let serverWaiter: ((msg: string) => void) | null = null;

  const clientTransport: Transport = {
    async send(message: JsonRpcRequest | JsonRpcNotification) {
      const data = JSON.stringify(message);
      if (serverWaiter) {
        const w = serverWaiter;
        serverWaiter = null;
        w(data);
      } else {
        clientToServer.push(data);
      }
    },
    async receive(): Promise<JsonRpcResponse> {
      if (serverToClient.length > 0) return JSON.parse(serverToClient.shift()!);
      return new Promise<JsonRpcResponse>((resolve) => {
        clientWaiter = (data: string) => resolve(JSON.parse(data));
      });
    },
    async close() {
      clientToServer.length = 0;
      serverToClient.length = 0;
    },
  };

  const serverTransport: Transport = {
    async send(message: JsonRpcRequest | JsonRpcNotification) {
      const data = JSON.stringify(message);
      if (clientWaiter) {
        const w = clientWaiter;
        clientWaiter = null;
        w(data);
      } else {
        serverToClient.push(data);
      }
    },
    async receive(): Promise<JsonRpcResponse> {
      if (clientToServer.length > 0) return JSON.parse(clientToServer.shift()!);
      return new Promise<JsonRpcResponse>((resolve) => {
        serverWaiter = (data: string) => resolve(JSON.parse(data));
      });
    },
    async close() {
      clientToServer.length = 0;
      serverToClient.length = 0;
    },
  };

  return { clientTransport, serverTransport };
}
