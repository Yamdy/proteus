import { parentPort } from "node:worker_threads";
import vm from "node:vm";

interface WorkerTaskMsg {
  type: "task";
  taskId: string;
  handlerName: string;
  handlerSource: string;
  eventName: string;
  contextSnapshot: unknown;
}

interface WorkerResultMsg {
  type: "result";
  taskId: string;
  ok: boolean;
  handlerResult?: unknown;
  error?: string;
}

if (!parentPort) {
  throw new Error("worker-entry must run inside a Worker Thread");
}

parentPort.on("message", async (msg: WorkerTaskMsg) => {
  if (msg.type !== "task") return;

  const { taskId, handlerSource, contextSnapshot } = msg;

  try {
    const wrapped = `return (async () => { const __h = (${handlerSource}); return await __h(ctx); })()`;
    const fn = vm.compileFunction(wrapped, ["ctx"], {
      parsingContext: vm.createContext(Object.create(null)),
    });
    const result = await fn(contextSnapshot);
    const response: WorkerResultMsg = {
      type: "result",
      taskId,
      ok: true,
      handlerResult: result,
    };
    parentPort!.postMessage(response);
  } catch (err) {
    const response: WorkerResultMsg = {
      type: "result",
      taskId,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
    parentPort!.postMessage(response);
  }
});

parentPort.postMessage({ type: "ready" });
